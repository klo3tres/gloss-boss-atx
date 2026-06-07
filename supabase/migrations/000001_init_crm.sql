-- Gloss Boss ATX — initial CRM + booking schema
-- Run in Supabase SQL Editor or via supabase db push

-- Extensions
create extension if not exists "pgcrypto";

-- Roles (application roles, stored on profiles)
do $$ begin
  create type public.app_role as enum (
    'super_admin',
    'admin',
    'technician',
    'customer'
  );
exception
  when duplicate_object then null;
end $$;

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'customer'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Customers (CRM identity; may exist before auth)
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users (id) on delete set null unique,
  email text not null,
  phone text,
  full_name text,
  created_at timestamptz not null default now()
);

create unique index if not exists customers_email_lower_idx on public.customers (lower(email));

-- Vehicles
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  description text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Services catalog (admin-editable)
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.service_prices (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  vehicle_class text not null check (vehicle_class in ('sedan', 'suv_truck')),
  price_cents int not null check (price_cents >= 0),
  unique (service_id, vehicle_class)
);

delete from public.service_prices sp
using public.service_prices dup
where sp.service_id = dup.service_id
  and sp.vehicle_class = dup.vehicle_class
  and sp.ctid < dup.ctid;

create unique index if not exists service_prices_service_id_vehicle_class_key
  on public.service_prices (service_id, vehicle_class);

-- Agreement templates (active one used at booking)
create table if not exists public.agreement_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  version int not null default 1,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Appointments / bookings
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  access_token uuid not null default gen_random_uuid() unique,
  status text not null default 'awaiting_payment' check (status in (
    'awaiting_payment',
    'deposit_paid',
    'confirmed',
    'assigned',
    'in_progress',
    'completed',
    'cancelled'
  )),
  guest_email text,
  guest_phone text,
  guest_name text,
  customer_id uuid references public.customers (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  vehicle_description text,
  service_slug text not null,
  vehicle_class text not null check (vehicle_class in ('sedan', 'suv_truck')),
  base_price_cents int not null,
  deposit_percent int not null default 30,
  deposit_amount_cents int not null,
  scheduled_start timestamptz not null,
  notes text,
  assigned_technician_id uuid references public.profiles (id) on delete set null,
  stripe_checkout_session_id text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_appointments_status on public.appointments (status);
create index if not exists idx_appointments_scheduled on public.appointments (scheduled_start);
create index if not exists idx_appointments_tech on public.appointments (assigned_technician_id);

-- Signed agreements (liability)
create table if not exists public.signed_agreements (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  template_id uuid references public.agreement_templates (id) on delete set null,
  template_version int not null,
  agreement_snapshot text not null,
  signer_legal_name text not null,
  signature_type text not null check (signature_type in ('typed', 'drawn')),
  signature_data text,
  ip_address text,
  user_agent text,
  signed_at timestamptz not null default now()
);

create unique index if not exists idx_signed_agreements_one_per_appt
  on public.signed_agreements (appointment_id);

-- Payments
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount_cents int not null,
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  created_at timestamptz not null default now()
);

-- Job media (inspection / before / after) — technicians primarily
create table if not exists public.job_media (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  category text not null check (category in ('inspection', 'before', 'after', 'other')),
  file_url text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Invoices
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  amount_cents int not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void')),
  created_at timestamptz not null default now()
);

-- Contact / internal messaging
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  from_name text not null,
  from_email text not null,
  subject text,
  body text not null,
  status text not null default 'new' check (status in ('new', 'read', 'replied', 'archived')),
  appointment_id uuid references public.appointments (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Activity log (audit)
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- Notifications (in-app)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.services enable row level security;
alter table public.service_prices enable row level security;
alter table public.agreement_templates enable row level security;
alter table public.appointments enable row level security;
alter table public.signed_agreements enable row level security;
alter table public.payments enable row level security;
alter table public.job_media enable row level security;
alter table public.invoices enable row level security;
alter table public.messages enable row level security;
alter table public.activity_logs enable row level security;
alter table public.notifications enable row level security;

-- Helper: current user's role
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'current_role'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    create function public.current_role()
    returns public.app_role
    language sql
    stable
    security definer
    set search_path = public
    as $fn$
      select role from public.profiles where id = auth.uid();
    $fn$;
  end if;
end $$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('super_admin', 'admin', 'technician');
$$;

create or replace function public.is_admin_level()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('super_admin', 'admin');
$$;

-- Profiles: users read/update self; staff read all profiles (for CRM)
create policy "profiles_select_self" on public.profiles
  for select using (id = auth.uid() or public.is_staff());

create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid());

create policy "profiles_insert_self" on public.profiles
  for insert with check (id = auth.uid());

-- Super admin can update any profile role (handled via service role in API for safety);
-- optional policy for super_admin only — here we keep role changes via service role API only.

-- Customers
create policy "customers_staff_all" on public.customers
  for all using (public.is_admin_level()) with check (public.is_admin_level());

create policy "customers_own_by_auth" on public.customers
  for select using (auth_user_id = auth.uid());

-- Vehicles
create policy "vehicles_staff_all" on public.vehicles
  for all using (public.is_admin_level()) with check (public.is_admin_level());

create policy "vehicles_customer_read" on public.vehicles
  for select using (
    exists (
      select 1 from public.customers c
      where c.id = vehicles.customer_id and c.auth_user_id = auth.uid()
    )
  );

-- Services & prices: public read active; staff write
create policy "services_public_read" on public.services
  for select using (active = true);

create policy "services_staff_write" on public.services
  for all using (public.is_admin_level()) with check (public.is_admin_level());

create policy "service_prices_public_read" on public.service_prices
  for select using (
    exists (select 1 from public.services s where s.id = service_prices.service_id and s.active = true)
  );

create policy "service_prices_staff_write" on public.service_prices
  for all using (public.is_admin_level()) with check (public.is_admin_level());

-- Agreement templates: public read active copy; staff manage all
create policy "agreement_templates_read_active" on public.agreement_templates
  for select using (active = true or public.is_staff());

create policy "agreement_templates_staff_write" on public.agreement_templates
  for all using (public.is_admin_level()) with check (public.is_admin_level());

-- Appointments: admins full access; technicians assigned jobs only
create policy "appointments_admin_all" on public.appointments
  for all using (public.is_admin_level()) with check (public.is_admin_level());

create policy "appointments_tech_select" on public.appointments
  for select using (
    public.current_role() = 'technician' and assigned_technician_id = auth.uid()
  );

create policy "appointments_tech_update" on public.appointments
  for update using (
    public.current_role() = 'technician' and assigned_technician_id = auth.uid()
  ) with check (
    public.current_role() = 'technician' and assigned_technician_id = auth.uid()
  );

create policy "appointments_customer_select" on public.appointments
  for select using (
    created_by = auth.uid()
    or exists (
      select 1 from public.customers c
      where c.id = appointments.customer_id and c.auth_user_id = auth.uid()
    )
  );

-- Signed agreements: staff; customer with appointment access
create policy "signed_agreements_staff" on public.signed_agreements
  for all using (public.is_staff()) with check (public.is_staff());

create policy "signed_agreements_customer_read" on public.signed_agreements
  for select using (
    exists (
      select 1 from public.appointments a
      where a.id = signed_agreements.appointment_id
        and (a.created_by = auth.uid() or exists (
          select 1 from public.customers c
          where c.id = a.customer_id and c.auth_user_id = auth.uid()
        ))
    )
  );

-- Payments: staff + customer linked
create policy "payments_staff" on public.payments
  for all using (public.is_staff()) with check (public.is_staff());

create policy "payments_customer_read" on public.payments
  for select using (
    exists (
      select 1 from public.appointments a
      where a.id = payments.appointment_id
        and (a.created_by = auth.uid() or exists (
          select 1 from public.customers c
          where c.id = a.customer_id and c.auth_user_id = auth.uid()
        ))
    )
  );

-- Job media
create policy "job_media_staff" on public.job_media
  for all using (public.is_staff()) with check (public.is_staff());

create policy "job_media_customer_read" on public.job_media
  for select using (
    exists (
      select 1 from public.appointments a
      where a.id = job_media.appointment_id
        and (a.created_by = auth.uid() or exists (
          select 1 from public.customers c
          where c.id = a.customer_id and c.auth_user_id = auth.uid()
        ))
    )
  );

-- Invoices
create policy "invoices_staff" on public.invoices
  for all using (public.is_admin_level()) with check (public.is_admin_level());

create policy "invoices_customer_read" on public.invoices
  for select using (
    exists (
      select 1 from public.appointments a
      where a.id = invoices.appointment_id
        and (a.created_by = auth.uid() or exists (
          select 1 from public.customers c
          where c.id = a.customer_id and c.auth_user_id = auth.uid()
        ))
    )
  );

-- Messages: anyone can insert (contact form) — use service role in API instead for spam control
-- For RLS simplicity: no anon insert; API uses service role.
create policy "messages_staff" on public.messages
  for all using (public.is_admin_level()) with check (public.is_admin_level());

-- Notifications
create policy "notifications_own" on public.notifications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notifications_staff_insert" on public.notifications
  for insert with check (public.is_admin_level());

-- Activity logs: staff read; system inserts via service role
create policy "activity_logs_staff" on public.activity_logs
  for select using (public.is_staff());

-- ---------- Seed default agreement + services ----------
insert into public.agreement_templates (title, body, version, active)
select
  'Vehicle Condition & Service Liability Acknowledgment',
  E'You acknowledge that Gloss Boss ATX will perform services based on the condition of the vehicle as described at booking.\n\n'
  || E'You agree that pre-existing damage, paint defects, trim wear, or interior stains may not be fully removable.\n\n'
  || E'You authorize Gloss Boss ATX to perform the selected services at the scheduled time and location.\n\n'
  || E'You understand that deposits may be non-refundable per company policy for late cancellations or no-shows.\n\n'
  || E'By signing below, you confirm you have read and accept this agreement.',
  1,
  true
where not exists (select 1 from public.agreement_templates limit 1);

-- Services seed
delete from public.service_prices sp
using public.service_prices dup
where sp.service_id = dup.service_id
  and sp.vehicle_class = dup.vehicle_class
  and sp.ctid < dup.ctid;

create unique index if not exists service_prices_service_id_vehicle_class_key
  on public.service_prices (service_id, vehicle_class);

insert into public.services (slug, title, subtitle, sort_order) values
  ('exterior-wash', 'Exterior Wash', 'Premium maintenance wash package', 1),
  ('interior-detail', 'Interior Detail', 'Deep interior reset package', 2),
  ('full-detail', 'Full Detail', 'Complete inside and outside detail', 3),
  ('ceramic-coating', 'Ceramic Coating', 'Long-term gloss protection', 4)
on conflict (slug) do nothing;

insert into public.service_prices (service_id, vehicle_class, price_cents)
select s.id, v.class, v.cents
from public.services s
cross join (values
  ('exterior-wash', 'sedan', 6000),
  ('exterior-wash', 'suv_truck', 7500),
  ('interior-detail', 'sedan', 8000),
  ('interior-detail', 'suv_truck', 10000),
  ('full-detail', 'sedan', 15000),
  ('full-detail', 'suv_truck', 17500)
) as v(slug, class, cents)
where s.slug = v.slug
on conflict (service_id, vehicle_class) do update set price_cents = excluded.price_cents;

-- Ceramic: no prices in seed (TBD) — skip prices

comment on table public.appointments is 'Core booking record; public creation via Next.js API + service role';
comment on table public.signed_agreements is 'Legal signature capture; required after deposit for confirmation';

-- Booking diagnostics + fallback queue + CRM ops (additive only).

-- ---------- booking_errors (diagnostic log) ----------
create table if not exists public.booking_errors (
  id uuid primary key default gen_random_uuid(),
  stage text not null,
  error_message text,
  error_code text,
  error_detail jsonb,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_booking_errors_created on public.booking_errors (created_at desc);

-- ---------- booking_fallbacks (when appointments insert cannot complete) ----------
create table if not exists public.booking_fallbacks (
  id uuid primary key default gen_random_uuid(),
  access_token uuid not null default gen_random_uuid() unique,
  payload jsonb not null,
  guest_email text,
  guest_phone text,
  guest_name text,
  deposit_amount_cents int not null default 0,
  base_price_cents int,
  scheduled_start timestamptz,
  status text not null default 'pending',
  converted_appointment_id uuid,
  promotion_error text,
  stripe_checkout_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_booking_fallbacks_status on public.booking_fallbacks (status);
create index if not exists idx_booking_fallbacks_created on public.booking_fallbacks (created_at desc);

-- ---------- appointments: common drift columns ----------
alter table public.appointments add column if not exists guest_email text;
alter table public.appointments add column if not exists guest_phone text;
alter table public.appointments add column if not exists guest_name text;
alter table public.appointments add column if not exists vehicle_description text;
alter table public.appointments add column if not exists service_slug text;
alter table public.appointments add column if not exists vehicle_class text;
alter table public.appointments add column if not exists base_price_cents int;
alter table public.appointments add column if not exists deposit_amount_cents int;
alter table public.appointments add column if not exists deposit_percent int;
alter table public.appointments add column if not exists scheduled_start timestamptz;
alter table public.appointments add column if not exists assigned_technician_id uuid;
alter table public.appointments add column if not exists service_address text;

alter table public.appointments add column if not exists booking_vehicles jsonb;
alter table public.appointments add column if not exists booking_add_ons jsonb;
alter table public.appointments add column if not exists booking_source text;
alter table public.appointments add column if not exists stripe_checkout_session_id text;

-- ---------- payments ----------
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

-- ---------- leads: add "no_response" (keep full status set from assignment migration) ----------
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads
  add constraint leads_status_check check (
    status in ('new', 'assigned', 'claimed', 'contacted', 'quoted', 'booked', 'no_response', 'lost')
  );

-- ---------- Normalized booking detail tables (optional; JSONB on appointments remains source of truth for booking flow) ----------
create table if not exists public.booking_vehicles (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments (id) on delete cascade,
  sort_order int not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_booking_vehicles_appt on public.booking_vehicles (appointment_id, sort_order);

create table if not exists public.booking_add_ons (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments (id) on delete cascade,
  slug text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_booking_add_ons_appt on public.booking_add_ons (appointment_id);

alter table public.booking_vehicles enable row level security;
alter table public.booking_add_ons enable row level security;

drop policy if exists booking_vehicles_staff on public.booking_vehicles;
create policy booking_vehicles_staff on public.booking_vehicles
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists booking_add_ons_staff on public.booking_add_ons;
create policy booking_add_ons_staff on public.booking_add_ons
  for all using (public.is_staff()) with check (public.is_staff());

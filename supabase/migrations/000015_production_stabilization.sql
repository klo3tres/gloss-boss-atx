-- Production stabilization: customers safety, intake, profiles admin read, column drift

-- Customers (idempotent — fixes "Could not find public.customers")
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users (id) on delete set null,
  email text not null,
  phone text,
  full_name text,
  created_at timestamptz not null default now()
);

create unique index if not exists customers_email_lower_idx on public.customers (lower(email));

alter table public.customers enable row level security;

drop policy if exists customers_admin_all on public.customers;
create policy customers_admin_all on public.customers
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );

-- Intake submissions (post-checkout)
create table if not exists public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  form_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists intake_submissions_appointment_uidx on public.intake_submissions (appointment_id);
create index if not exists idx_intake_submissions_created on public.intake_submissions (created_at desc);

alter table public.intake_submissions enable row level security;

drop policy if exists intake_submissions_admin_read on public.intake_submissions;
create policy intake_submissions_admin_read on public.intake_submissions
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin', 'technician')
    )
  );

drop policy if exists intake_submissions_guest_insert on public.intake_submissions;
create policy intake_submissions_guest_insert on public.intake_submissions
  for insert
  with check (true);

alter table public.appointments add column if not exists intake_completed_at timestamptz;
alter table public.appointments add column if not exists job_started_at timestamptz;
alter table public.appointments add column if not exists job_completed_at timestamptz;

-- Gallery / offers column drift
alter table public.gallery_images add column if not exists order_index int;
alter table public.gallery_images add column if not exists published boolean default true;
alter table public.gallery_images add column if not exists active boolean default true;

alter table public.offers add column if not exists label text;
alter table public.offers add column if not exists percent_off numeric;
alter table public.offers add column if not exists sort_order int default 0;

-- Profiles: staff roster readable by admins
drop policy if exists profiles_admin_select_staff on public.profiles;
create policy profiles_admin_select_staff on public.profiles
  for select
  using (
    auth.uid() = id
    or exists (
      select 1 from public.profiles me
      where me.id = auth.uid() and me.role in ('admin', 'super_admin')
    )
  );

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists updated_at timestamptz default now();

-- CMS documents: intake category support (check constraint relaxed via text column)
comment on table public.cms_documents is 'category: liability | sop | intake | homepage_banner | other';

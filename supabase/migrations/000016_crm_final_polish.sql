-- CRM final polish: cms_documents categories, messages columns, leads, goals, gallery featured

-- cms_documents: allow intake + training categories
alter table public.cms_documents drop constraint if exists cms_documents_category_check;
alter table public.cms_documents add constraint cms_documents_category_check
  check (category in ('liability', 'sop', 'intake', 'homepage_banner', 'training', 'other'));

-- messages resilient columns
alter table public.messages add column if not exists from_name text;
alter table public.messages add column if not exists from_email text;
alter table public.messages add column if not exists from_phone text;
alter table public.messages add column if not exists body text;
alter table public.messages add column if not exists subject text;
alter table public.messages add column if not exists status text default 'new';
alter table public.messages add column if not exists created_at timestamptz default now();

-- gallery featured flag
alter table public.gallery_images add column if not exists featured boolean default false;

-- leads mini-CRM
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  phone text,
  email text,
  address text,
  vehicle text,
  notes text,
  lead_source text default 'field',
  contact_attempts int not null default 0,
  status text not null default 'new' check (status in ('new', 'contacted', 'quoted', 'booked', 'lost')),
  created_by uuid references auth.users (id) on delete set null,
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_status on public.leads (status, created_at desc);

alter table public.leads enable row level security;

drop policy if exists leads_staff_all on public.leads;
create policy leads_staff_all on public.leads
  for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin', 'technician'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin', 'technician'))
  );

-- business / tech goals (site_settings key also used)
create table if not exists public.business_goals (
  id uuid primary key default gen_random_uuid(),
  goal_key text not null unique,
  label text not null default '',
  target_cents int not null default 0,
  period text not null default 'week' check (period in ('day', 'week', 'month')),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.business_goals enable row level security;

drop policy if exists business_goals_staff on public.business_goals;
create policy business_goals_staff on public.business_goals
  for all
  using (public.is_staff())
  with check (public.is_staff());

insert into public.business_goals (goal_key, label, target_cents, period)
values
  ('tech_revenue_week', 'Technician revenue (week)', 250000, 'week'),
  ('company_revenue_week', 'Company revenue (week)', 500000, 'week')
on conflict (goal_key) do nothing;

-- customer vehicles (optional detail)
create table if not exists public.customer_vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete cascade,
  description text not null default '',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_vehicles_customer on public.customer_vehicles (customer_id);

alter table public.customer_vehicles enable row level security;

drop policy if exists customer_vehicles_staff on public.customer_vehicles;
create policy customer_vehicles_staff on public.customer_vehicles
  for all
  using (public.is_staff())
  with check (public.is_staff());

notify pgrst, 'reload schema';

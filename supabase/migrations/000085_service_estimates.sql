-- Service estimate pipeline: lead → estimate → approval → deposit → work order.

create table if not exists public.service_estimates (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  access_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'draft' check (
    status in ('draft', 'sent', 'approved', 'declined', 'deposit_paid', 'converted', 'expired')
  ),
  customer_name text not null,
  customer_email text,
  customer_phone text,
  service_address text,
  vehicle_description text,
  service_slug text,
  vehicle_class text default 'standard',
  line_items jsonb not null default '[]'::jsonb,
  subtotal_cents integer not null default 0,
  discount_cents integer not null default 0,
  total_cents integer not null default 0,
  deposit_cents integer not null default 0,
  scheduled_start timestamptz,
  notes text,
  valid_until timestamptz,
  sent_at timestamptz,
  approved_at timestamptz,
  declined_at timestamptz,
  deposit_paid_at timestamptz,
  converted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_estimates_lead on public.service_estimates (lead_id, created_at desc);
create index if not exists idx_service_estimates_token on public.service_estimates (access_token);
create index if not exists idx_service_estimates_status on public.service_estimates (status, updated_at desc);

alter table public.service_estimates enable row level security;

drop policy if exists service_estimates_staff_all on public.service_estimates;
create policy service_estimates_staff_all on public.service_estimates for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin','super_admin','technician'))
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin','super_admin','technician'))
);

alter table public.leads add column if not exists latest_estimate_id uuid references public.service_estimates (id) on delete set null;

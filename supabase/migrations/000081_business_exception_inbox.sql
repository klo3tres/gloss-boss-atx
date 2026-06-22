create table if not exists public.business_exceptions (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  kind text not null,
  severity text not null default 'warning',
  status text not null default 'open',
  title text not null,
  detail text,
  appointment_id uuid references public.appointments(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  source_table text,
  source_id text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_business_exceptions_open on public.business_exceptions(status, severity, last_seen_at desc);
create index if not exists idx_business_exceptions_appointment on public.business_exceptions(appointment_id, status);
alter table public.business_exceptions enable row level security;
drop policy if exists business_exceptions_staff_all on public.business_exceptions;
create policy business_exceptions_staff_all on public.business_exceptions for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin','super_admin'))
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin','super_admin'))
);

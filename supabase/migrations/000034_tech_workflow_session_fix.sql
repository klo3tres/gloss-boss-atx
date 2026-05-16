-- Tech walk-in workflow session hardening (safe additive only).

create extension if not exists pgcrypto;

alter table public.appointments add column if not exists booking_source text;
alter table public.appointments add column if not exists access_token text;
alter table public.appointments add column if not exists status text;
alter table public.appointments add column if not exists assigned_technician_id uuid references public.profiles (id) on delete set null;
alter table public.appointments add column if not exists assigned_by uuid references public.profiles (id) on delete set null;
alter table public.appointments add column if not exists assigned_at timestamptz;
alter table public.appointments add column if not exists created_at timestamptz not null default now();

alter table public.booking_fallbacks add column if not exists booking_source text;
alter table public.booking_fallbacks add column if not exists access_token text default encode(gen_random_bytes(16), 'hex');
alter table public.booking_fallbacks add column if not exists status text;
alter table public.booking_fallbacks add column if not exists assigned_technician_id uuid references public.profiles (id) on delete set null;
alter table public.booking_fallbacks add column if not exists assigned_by uuid references public.profiles (id) on delete set null;
alter table public.booking_fallbacks add column if not exists assigned_at timestamptz;
alter table public.booking_fallbacks add column if not exists created_at timestamptz not null default now();
alter table public.booking_fallbacks add column if not exists vehicle_description text;
alter table public.booking_fallbacks add column if not exists service_slug text;

create table if not exists public.tech_workflow_sessions (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.profiles (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  fallback_booking_id uuid references public.booking_fallbacks (id) on delete set null,
  access_token text,
  status text not null default 'active',
  customer_name text,
  vehicle_summary text,
  service_slug text,
  total_cents integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tech_workflow_sessions add column if not exists technician_id uuid references public.profiles (id) on delete cascade;
alter table public.tech_workflow_sessions add column if not exists appointment_id uuid references public.appointments (id) on delete set null;
alter table public.tech_workflow_sessions add column if not exists fallback_booking_id uuid references public.booking_fallbacks (id) on delete set null;
alter table public.tech_workflow_sessions add column if not exists access_token text;
alter table public.tech_workflow_sessions add column if not exists status text not null default 'active';
alter table public.tech_workflow_sessions add column if not exists customer_name text;
alter table public.tech_workflow_sessions add column if not exists vehicle_summary text;
alter table public.tech_workflow_sessions add column if not exists service_slug text;
alter table public.tech_workflow_sessions add column if not exists total_cents integer;
alter table public.tech_workflow_sessions add column if not exists created_at timestamptz not null default now();
alter table public.tech_workflow_sessions add column if not exists updated_at timestamptz not null default now();

create index if not exists tech_workflow_sessions_technician_status_updated_idx
  on public.tech_workflow_sessions (technician_id, status, updated_at desc);

create index if not exists appointments_tech_workflow_assigned_created_idx
  on public.appointments (assigned_technician_id, created_at desc)
  where booking_source = 'tech_workflow';

create index if not exists booking_fallbacks_tech_workflow_assigned_created_idx
  on public.booking_fallbacks (assigned_technician_id, created_at desc)
  where booking_source = 'tech_workflow';

alter table public.tech_workflow_sessions enable row level security;

drop policy if exists "Technicians can read own workflow sessions" on public.tech_workflow_sessions;
create policy "Technicians can read own workflow sessions"
  on public.tech_workflow_sessions
  for select
  using (auth.uid() = technician_id);

drop policy if exists "Technicians can insert own workflow sessions" on public.tech_workflow_sessions;
create policy "Technicians can insert own workflow sessions"
  on public.tech_workflow_sessions
  for insert
  with check (auth.uid() = technician_id);

drop policy if exists "Technicians can update own workflow sessions" on public.tech_workflow_sessions;
create policy "Technicians can update own workflow sessions"
  on public.tech_workflow_sessions
  for update
  using (auth.uid() = technician_id)
  with check (auth.uid() = technician_id);

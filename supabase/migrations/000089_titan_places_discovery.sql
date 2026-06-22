-- Titan Lead Radar: Google Places discovery fields + run history.

alter table public.titan_prospects add column if not exists google_place_id text;
alter table public.titan_prospects add column if not exists lat numeric;
alter table public.titan_prospects add column if not exists lng numeric;
alter table public.titan_prospects add column if not exists discovered_at timestamptz;

create unique index if not exists idx_titan_prospects_google_place_id
  on public.titan_prospects (google_place_id)
  where google_place_id is not null;

create table if not exists public.titan_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz,
  radius_miles numeric not null default 15,
  center_lat numeric,
  center_lng numeric,
  discovered_count integer not null default 0,
  new_count integer not null default 0,
  by_type jsonb not null default '{}'::jsonb,
  new_by_type jsonb not null default '{}'::jsonb,
  potential_monthly_cents integer not null default 0,
  error_message text
);

create index if not exists idx_titan_discovery_runs_started on public.titan_discovery_runs (started_at desc);

alter table public.titan_discovery_runs enable row level security;

drop policy if exists titan_discovery_runs_staff on public.titan_discovery_runs;
create policy titan_discovery_runs_staff on public.titan_discovery_runs for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

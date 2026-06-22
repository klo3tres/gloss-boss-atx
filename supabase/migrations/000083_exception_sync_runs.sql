-- Tracks background exception sync runs for operational visibility.

create table if not exists public.exception_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  synced_count integer not null default 0,
  resolved_count integer not null default 0,
  scan_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_exception_sync_runs_started on public.exception_sync_runs (started_at desc);

alter table public.exception_sync_runs enable row level security;

drop policy if exists exception_sync_runs_staff_read on public.exception_sync_runs;
create policy exception_sync_runs_staff_read on public.exception_sync_runs for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin','super_admin'))
);

alter table public.business_exceptions add column if not exists receipt_id uuid;
alter table public.business_exceptions add column if not exists auto_resolved boolean not null default false;

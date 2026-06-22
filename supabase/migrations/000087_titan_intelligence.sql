-- Titan intelligence: nightly run log + opportunity follow-up metadata support.

create table if not exists public.titan_nightly_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  revenue_leak_cents integer not null default 0,
  opportunities_found integer not null default 0,
  opportunities_queued integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_titan_nightly_runs_started on public.titan_nightly_runs (started_at desc);

alter table public.titan_nightly_runs enable row level security;

drop policy if exists titan_nightly_runs_staff on public.titan_nightly_runs;
create policy titan_nightly_runs_staff on public.titan_nightly_runs for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

alter table public.customer_follow_ups add column if not exists source text default 'standard';
alter table public.customer_follow_ups add column if not exists rebook_probability numeric;

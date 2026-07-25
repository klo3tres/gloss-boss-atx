create table if not exists public.google_calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  work_order_id uuid not null references public.appointments(id) on delete cascade,
  google_event_id text,
  attempted_action text not null default 'upsert',
  provider_status text not null default 'pending'
    check (provider_status in ('not_connected','pending','syncing','synced','update_pending','retry_scheduled','authentication_required','failed','cancelled')),
  sanitized_error_code text,
  retry_count integer not null default 0,
  last_attempted_at timestamptz,
  last_successful_sync_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id)
);

create index if not exists google_calendar_sync_jobs_status_idx
  on public.google_calendar_sync_jobs (provider_status, next_retry_at);

alter table public.google_calendar_sync_jobs enable row level security;

drop policy if exists google_calendar_sync_jobs_admin on public.google_calendar_sync_jobs;
create policy google_calendar_sync_jobs_admin on public.google_calendar_sync_jobs
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- DB-backed Google Calendar pull lock (prevents concurrent / spammy pulls)

alter table public.google_calendar_connections
  add column if not exists pull_in_progress_at timestamptz;

create index if not exists google_calendar_connections_pull_lock_idx
  on public.google_calendar_connections (pull_in_progress_at)
  where pull_in_progress_at is not null;

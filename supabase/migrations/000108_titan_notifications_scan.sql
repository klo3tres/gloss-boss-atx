-- Titan notification ledger + scan budget + owner alert preferences

create table if not exists public.titan_notification_events (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  title text not null,
  body text not null,
  source text,
  priority text not null default 'normal',
  related_type text,
  related_id text,
  related_url text,
  read_at timestamptz,
  archived_at timestamptz,
  email_status text,
  sms_status text,
  pushover_status text,
  provider_payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_titan_notification_events_ws_created
  on public.titan_notification_events (workspace_key, created_at desc);
create index if not exists idx_titan_notification_events_unread
  on public.titan_notification_events (workspace_key, read_at)
  where read_at is null and archived_at is null;

alter table public.titan_notification_events enable row level security;

drop policy if exists titan_notification_events_staff on public.titan_notification_events;
create policy titan_notification_events_staff on public.titan_notification_events
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin', 'technician')
    )
  );

create table if not exists public.titan_scan_budget (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  provider text not null,
  scan_type text not null,
  daily_limit integer not null default 25,
  used_today integer not null default 0,
  reset_at timestamptz,
  last_scan_at timestamptz,
  next_allowed_scan_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_key, provider, scan_type)
);

create index if not exists idx_titan_scan_budget_ws_provider
  on public.titan_scan_budget (workspace_key, provider);

alter table public.titan_scan_budget enable row level security;

drop policy if exists titan_scan_budget_staff on public.titan_scan_budget;
create policy titan_scan_budget_staff on public.titan_scan_budget
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );

alter table public.titan_workspace_settings
  add column if not exists notify_email_enabled boolean default true,
  add column if not exists notify_sms_enabled boolean default true,
  add column if not exists notify_pushover_enabled boolean default true,
  add column if not exists notify_bookings boolean default true,
  add column if not exists notify_payments boolean default true,
  add column if not exists notify_leads boolean default true,
  add column if not exists notify_weather boolean default true,
  add column if not exists notify_inventory boolean default true,
  add column if not exists quiet_hours_start text,
  add column if not exists quiet_hours_end text,
  add column if not exists lead_radar_auto_scan_enabled boolean default false,
  add column if not exists google_places_scan_frequency text default 'on_login',
  add column if not exists max_places_requests_per_day integer default 25,
  add column if not exists last_lead_radar_scan_at timestamptz,
  add column if not exists next_lead_radar_scan_at timestamptz;

comment on column public.titan_workspace_settings.google_places_scan_frequency is
  'manual | on_login | twice_daily | four_times_daily | hourly';

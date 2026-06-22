-- Titan public site guide widget analytics + territory cache.

create table if not exists public.titan_widget_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in ('open', 'question', 'lead_created', 'quote_request', 'booking_click', 'handoff', 'action_click')
  ),
  session_id text,
  question_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_titan_widget_events_type on public.titan_widget_events (event_type, created_at desc);
create index if not exists idx_titan_widget_events_question on public.titan_widget_events (question_key, created_at desc);

alter table public.titan_widget_events enable row level security;

drop policy if exists titan_widget_events_staff on public.titan_widget_events;
create policy titan_widget_events_staff on public.titan_widget_events for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

create table if not exists public.titan_territory_snapshots (
  id uuid primary key default gen_random_uuid(),
  computed_at timestamptz not null default now(),
  insights jsonb not null default '[]'::jsonb,
  suggested_expansion text,
  expected_roi_percent numeric
);

create index if not exists idx_titan_territory_snapshots_at on public.titan_territory_snapshots (computed_at desc);

alter table public.titan_territory_snapshots enable row level security;

drop policy if exists titan_territory_snapshots_staff on public.titan_territory_snapshots;
create policy titan_territory_snapshots_staff on public.titan_territory_snapshots for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

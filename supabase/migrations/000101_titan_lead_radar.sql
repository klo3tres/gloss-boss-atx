-- Titan Lead Radar v1: manual-assisted lead capture + classification

create table if not exists public.titan_lead_radar_items (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  source_type text not null,
  source_name text,
  source_url text,
  author_name text,
  author_profile_url text,
  contact_name text,
  phone text,
  email text,
  location_text text,
  raw_text text not null,
  detected_intent text not null default 'unknown',
  service_match text,
  estimated_revenue numeric not null default 0,
  confidence_score integer not null default 50,
  urgency_score integer not null default 50,
  opportunity_id uuid references public.titan_opportunities (id) on delete set null,
  status text not null default 'new',
  recommended_reply text,
  why_titan_flagged text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  next_follow_up_at timestamptz,
  constraint titan_lead_radar_items_status_check check (
    status in ('new', 'reviewed', 'replied', 'converted_to_opportunity', 'ignored', 'lost')
  )
);

create table if not exists public.titan_lead_radar_events (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  radar_item_id uuid not null references public.titan_lead_radar_items (id) on delete cascade,
  event_type text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_titan_lead_radar_workspace on public.titan_lead_radar_items (workspace_key, status, created_at desc);
create index if not exists idx_titan_lead_radar_source on public.titan_lead_radar_items (source_type, status);
create index if not exists idx_titan_lead_radar_intent on public.titan_lead_radar_items (detected_intent, confidence_score desc);
create index if not exists idx_titan_lead_radar_follow_up on public.titan_lead_radar_items (next_follow_up_at, status);
create index if not exists idx_titan_lead_radar_events_item on public.titan_lead_radar_events (radar_item_id, created_at desc);
create index if not exists idx_titan_lead_radar_events_workspace on public.titan_lead_radar_events (workspace_key, created_at desc);

alter table public.titan_lead_radar_items enable row level security;
alter table public.titan_lead_radar_events enable row level security;

drop policy if exists titan_lead_radar_items_staff on public.titan_lead_radar_items;
create policy titan_lead_radar_items_staff on public.titan_lead_radar_items for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

drop policy if exists titan_lead_radar_events_staff on public.titan_lead_radar_events;
create policy titan_lead_radar_events_staff on public.titan_lead_radar_events for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

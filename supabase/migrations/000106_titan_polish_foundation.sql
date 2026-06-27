-- Migration 000106: Brand settings, Media Studio, territory, calendar pull, onboarding, missions, blocks

-- 1. Brand + platform fields on workspace
alter table public.titan_workspace_settings
  add column if not exists workspace_slug text not null default 'gloss-boss-atx',
  add column if not exists business_display_name text,
  add column if not exists legal_business_name text,
  add column if not exists brand_short_name text,
  add column if not exists brand_city_label text,
  add column if not exists brand_slug text,
  add column if not exists logo_url text,
  add column if not exists icon_url text,
  add column if not exists hero_video_url text,
  add column if not exists hero_video_poster_url text,
  add column if not exists hero_video_enabled boolean not null default false,
  add column if not exists primary_color text default '#d4af37',
  add column if not exists accent_color text default '#f1d28a',
  add column if not exists support_email text,
  add column if not exists support_phone text,
  add column if not exists website_url text,
  add column if not exists public_booking_url text,
  add column if not exists ga_measurement_id text,
  add column if not exists clarity_project_id text,
  add column if not exists gsc_verification_note text,
  add column if not exists is_titan_platform_mode boolean not null default false,
  add column if not exists public_titan_enabled boolean not null default true,
  add column if not exists allowed_domains text[] not null default '{}'::text[],
  add column if not exists google_blocks_booking boolean not null default true,
  add column if not exists calendar_last_pull_at timestamptz;

update public.titan_workspace_settings
set
  business_display_name = coalesce(business_display_name, business_name, 'Gloss Boss ATX'),
  legal_business_name = coalesce(legal_business_name, business_name, 'Gloss Boss ATX LLC'),
  brand_short_name = coalesce(brand_short_name, 'Gloss Boss'),
  brand_city_label = coalesce(brand_city_label, 'Austin, TX'),
  brand_slug = coalesce(brand_slug, 'gloss-boss-atx'),
  support_email = coalesce(support_email, owner_email),
  support_phone = coalesce(support_phone, owner_phone),
  website_url = coalesce(website_url, 'https://www.glossbossatx.com'),
  public_booking_url = coalesce(public_booking_url, 'https://www.glossbossatx.com/book'),
  ga_measurement_id = coalesce(ga_measurement_id, 'G-VWFWQ0P9GB'),
  clarity_project_id = coalesce(clarity_project_id, 'xddon9jp0d')
where workspace_key = 'default';

-- 2. Media Studio assets
create table if not exists public.site_media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  media_type text not null default 'image',
  placement text not null default 'general',
  title text,
  description text,
  storage_path text,
  external_url text,
  public_url text,
  poster_url text,
  alt_text text,
  caption text,
  crop_settings jsonb not null default '{}'::jsonb,
  trim_start_seconds numeric,
  trim_end_seconds numeric,
  file_size_bytes bigint,
  mime_type text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_media_assets_placement_idx
  on public.site_media_assets (workspace_key, placement, is_active);

-- 3. Territory tracker
create table if not exists public.titan_territories (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  name text not null,
  city text,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.titan_territory_locations (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  territory_id uuid references public.titan_territories(id) on delete cascade,
  address text not null,
  lat numeric,
  lng numeric,
  location_type text not null default 'residential',
  status text not null default 'not_visited',
  no_soliciting boolean not null default false,
  do_not_return boolean not null default false,
  contact_name text,
  phone text,
  email text,
  notes text,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  estimated_revenue_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists titan_territory_locations_territory_idx
  on public.titan_territory_locations (territory_id);

-- 4. Google Calendar external events (pull sync)
create table if not exists public.google_calendar_external_events (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  google_event_id text not null,
  google_calendar_id text not null default 'primary',
  summary text,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  blocks_booking boolean not null default true,
  etag text,
  status text not null default 'confirmed',
  last_pulled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (google_event_id, google_calendar_id)
);

create index if not exists google_calendar_external_events_range_idx
  on public.google_calendar_external_events (start_at, end_at);

-- 5. One-off availability blocks
create table if not exists public.booking_availability_blocks (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  title text not null default 'Blocked',
  start_at timestamptz not null,
  end_at timestamptz not null,
  blocks_booking boolean not null default true,
  source text not null default 'manual',
  google_event_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists booking_availability_blocks_google_event_uidx
  on public.booking_availability_blocks (google_event_id)
  where google_event_id is not null;

-- 6. Onboarding checklist progress
create table if not exists public.titan_onboarding_progress (
  workspace_key text not null default 'default',
  checklist_key text not null,
  completed_at timestamptz not null default now(),
  primary key (workspace_key, checklist_key)
);

-- 7. Revenue missions
create table if not exists public.titan_revenue_missions (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  mission_key text not null,
  title text not null,
  description text,
  estimated_revenue_cents integer not null default 0,
  effort_level text not null default 'medium',
  confidence_score integer not null default 70,
  recommended_script text,
  action_href text,
  status text not null default 'open',
  completed_at timestamptz,
  outcome_notes text,
  outcome_revenue_cents integer,
  mission_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists titan_revenue_missions_date_idx
  on public.titan_revenue_missions (workspace_key, mission_date, status);

-- 8. Inventory usage history
create table if not exists public.titan_inventory_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  inventory_item_id uuid references public.titan_inventory_items(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  quantity_used numeric not null default 1,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.google_calendar_connections
  add column if not exists last_push_at timestamptz,
  add column if not exists last_pull_at timestamptz,
  add column if not exists push_count integer not null default 0,
  add column if not exists pull_count integer not null default 0,
  add column if not exists last_error text;

-- RLS
alter table public.site_media_assets enable row level security;
alter table public.titan_territories enable row level security;
alter table public.titan_territory_locations enable row level security;
alter table public.google_calendar_external_events enable row level security;
alter table public.booking_availability_blocks enable row level security;
alter table public.titan_onboarding_progress enable row level security;
alter table public.titan_revenue_missions enable row level security;
alter table public.titan_inventory_usage enable row level security;

drop policy if exists "site_media_assets_admin" on public.site_media_assets;
create policy "site_media_assets_admin" on public.site_media_assets for all to authenticated using (true);

drop policy if exists "titan_territories_admin" on public.titan_territories;
create policy "titan_territories_admin" on public.titan_territories for all to authenticated using (true);

drop policy if exists "titan_territory_locations_admin" on public.titan_territory_locations;
create policy "titan_territory_locations_admin" on public.titan_territory_locations for all to authenticated using (true);

drop policy if exists "google_calendar_external_events_admin" on public.google_calendar_external_events;
create policy "google_calendar_external_events_admin" on public.google_calendar_external_events for all to authenticated using (true);

drop policy if exists "booking_availability_blocks_admin" on public.booking_availability_blocks;
create policy "booking_availability_blocks_admin" on public.booking_availability_blocks for all to authenticated using (true);

drop policy if exists "titan_onboarding_progress_admin" on public.titan_onboarding_progress;
create policy "titan_onboarding_progress_admin" on public.titan_onboarding_progress for all to authenticated using (true);

drop policy if exists "titan_revenue_missions_admin" on public.titan_revenue_missions;
create policy "titan_revenue_missions_admin" on public.titan_revenue_missions for all to authenticated using (true);

drop policy if exists "titan_inventory_usage_admin" on public.titan_inventory_usage;
create policy "titan_inventory_usage_admin" on public.titan_inventory_usage for all to authenticated using (true);

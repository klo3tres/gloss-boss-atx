-- Migration 000105: Titan Phase 2 foundation — Google Calendar sync + inventory operator

create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  google_account_email text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  calendar_id text not null default 'primary',
  sync_enabled boolean not null default true,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_calendar_event_map (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  google_event_id text not null,
  google_calendar_id text not null default 'primary',
  etag text,
  last_pushed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id)
);

create index if not exists google_calendar_event_map_google_event_idx
  on public.google_calendar_event_map (google_event_id);

create table if not exists public.titan_inventory_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  category text not null default 'supplies',
  unit text not null default 'each',
  quantity_on_hand numeric not null default 0,
  reorder_threshold numeric not null default 0,
  reorder_quantity numeric not null default 0,
  cost_per_unit_cents integer not null default 0,
  notes text,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_event_map enable row level security;
alter table public.titan_inventory_items enable row level security;

drop policy if exists "google_calendar_connections_admin" on public.google_calendar_connections;
create policy "google_calendar_connections_admin"
  on public.google_calendar_connections for all
  to authenticated
  using (true);

drop policy if exists "google_calendar_event_map_admin" on public.google_calendar_event_map;
create policy "google_calendar_event_map_admin"
  on public.google_calendar_event_map for all
  to authenticated
  using (true);

drop policy if exists "titan_inventory_items_admin" on public.titan_inventory_items;
create policy "titan_inventory_items_admin"
  on public.titan_inventory_items for all
  to authenticated
  using (true);

-- Seed common mobile detailing supplies
insert into public.titan_inventory_items (slug, label, category, unit, quantity_on_hand, reorder_threshold, reorder_quantity, sort_order)
values
  ('chemicals-all-purpose', 'All-purpose cleaner', 'chemicals', 'bottle', 0, 2, 6, 10),
  ('chemicals-wheel', 'Wheel cleaner', 'chemicals', 'bottle', 0, 2, 4, 20),
  ('towels-microfiber', 'Microfiber towels', 'supplies', 'each', 0, 20, 50, 30),
  ('brushes-detail', 'Detail brushes', 'supplies', 'set', 0, 1, 2, 40),
  ('pads-polish', 'Polish pads', 'supplies', 'each', 0, 10, 25, 50),
  ('gloves-nitrile', 'Nitrile gloves', 'supplies', 'box', 0, 1, 3, 60),
  ('water-jugs', 'Water jugs', 'supplies', 'each', 0, 2, 4, 70),
  ('fuel-reserve', 'Fuel reserve', 'operations', 'gallon', 0, 5, 10, 80)
on conflict (slug) do nothing;

-- Default addon duration estimates (minutes) when admin has not set custom values
update public.addons set estimated_min_minutes = 20, estimated_max_minutes = 30 where slug ilike '%engine%' and estimated_max_minutes = 0;
update public.addons set estimated_min_minutes = 25, estimated_max_minutes = 45 where slug ilike '%clay%' and estimated_max_minutes = 0;
update public.addons set estimated_min_minutes = 30, estimated_max_minutes = 45 where slug ilike '%pet%' and estimated_max_minutes = 0;
update public.addons set estimated_min_minutes = 35, estimated_max_minutes = 50 where slug ilike '%upholstery%' and estimated_max_minutes = 0;
update public.addons set estimated_min_minutes = 25, estimated_max_minutes = 40 where slug ilike '%odor%' and estimated_max_minutes = 0;

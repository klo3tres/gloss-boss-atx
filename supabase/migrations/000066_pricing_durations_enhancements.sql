-- Migration 000066: Add service durations, pricing fields, and gift cards tracking
-- Alters public.services and public.addons, then creates public.gift_cards.

-- 1. Alter services table to support premium pricing/duration features
alter table public.services
add column if not exists estimated_min_minutes integer not null default 60,
add column if not exists estimated_max_minutes integer not null default 90,
add column if not exists coming_soon boolean not null default false,
add column if not exists quote_required boolean not null default false,
add column if not exists display_order integer not null default 0,
add column if not exists public_description text,
add column if not exists admin_notes text,
add column if not exists inclusions text[] not null default '{}'::text[];

-- 2. Alter addons table to support duration estimates
alter table public.addons
add column if not exists estimated_min_minutes integer not null default 0,
add column if not exists estimated_max_minutes integer not null default 0;

-- Update defaults for existing canonical services in the DB
update public.services set estimated_min_minutes = 60, estimated_max_minutes = 90, display_order = 10 where slug = 'exterior-wash';
update public.services set estimated_min_minutes = 120, estimated_max_minutes = 180, display_order = 20 where slug = 'exterior-detail';
update public.services set estimated_min_minutes = 90, estimated_max_minutes = 150, display_order = 30 where slug = 'interior-detail';
update public.services set estimated_min_minutes = 180, estimated_max_minutes = 240, display_order = 40 where slug = 'full-detail';
update public.services set estimated_min_minutes = 1440, estimated_max_minutes = 2880, quote_required = true, coming_soon = true, display_order = 50 where slug = 'ceramic-coating';

-- Correct production baseline pricing. Admin can override later from Services & Pricing.
insert into public.service_prices (service_id, vehicle_class, price_cents)
select s.id, p.vehicle_class, p.price_cents
from public.services s
join (values
  ('exterior-wash', 'sedan', 7500),
  ('exterior-wash', 'suv', 10000),
  ('exterior-wash', 'truck', 12500),
  ('exterior-wash', 'suv_truck', 10000),
  ('exterior-detail', 'sedan', 13000),
  ('exterior-detail', 'suv', 15000),
  ('exterior-detail', 'truck', 17000),
  ('exterior-detail', 'suv_truck', 15000),
  ('interior-detail', 'sedan', 16500),
  ('interior-detail', 'suv', 19500),
  ('interior-detail', 'truck', 22500),
  ('interior-detail', 'suv_truck', 19500),
  ('full-detail', 'sedan', 22500),
  ('full-detail', 'suv', 25500),
  ('full-detail', 'truck', 27500),
  ('full-detail', 'suv_truck', 25500)
) as p(slug, vehicle_class, price_cents) on p.slug = s.slug
on conflict (service_id, vehicle_class) do update
set price_cents = excluded.price_cents;

-- 3. Create gift cards table for tracking
create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  purchaser_name text,
  purchaser_email text,
  purchaser_phone text,
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  original_balance_cents integer not null default 0,
  current_balance_cents integer not null default 0,
  status text not null default 'active', -- 'active', 'redeemed', 'voided'
  notes text,
  redemption_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS for gift cards
alter table public.gift_cards enable row level security;

-- Drop policies if they exist and recreate
drop policy if exists "gift_cards_admin_all" on public.gift_cards;
create policy "gift_cards_admin_all"
  on public.gift_cards for all
  to authenticated
  using (true);

drop policy if exists "gift_cards_anon_read" on public.gift_cards;
create policy "gift_cards_anon_read"
  on public.gift_cards for select
  to anon
  using (status = 'active');

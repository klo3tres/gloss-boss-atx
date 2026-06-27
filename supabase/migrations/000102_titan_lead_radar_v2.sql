-- Titan Lead Radar v2: playbooks, daily hunt checklist, competitor insights

create table if not exists public.titan_lead_playbooks (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  title text not null,
  platform text not null,
  search_query text not null,
  target_customer text,
  intent_to_find text,
  example_phrases text[] not null default '{}'::text[],
  suggested_action text,
  estimated_revenue_min numeric not null default 0,
  estimated_revenue_max numeric not null default 0,
  priority integer not null default 50,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_titan_lead_playbooks_unique
  on public.titan_lead_playbooks (workspace_key, platform, search_query);

create table if not exists public.titan_daily_hunt_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  task_date date not null,
  task_key text not null,
  label text not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_key, task_date, task_key)
);

create index if not exists idx_titan_daily_hunt_date on public.titan_daily_hunt_tasks (workspace_key, task_date);

create table if not exists public.titan_competitor_insights (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'default',
  competitor_name text not null,
  source_url text,
  review_text text not null,
  pain_points text[] not null default '{}'::text[],
  positioning text,
  message_angle text,
  service_package text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.titan_lead_playbooks enable row level security;
alter table public.titan_daily_hunt_tasks enable row level security;
alter table public.titan_competitor_insights enable row level security;

drop policy if exists titan_lead_playbooks_staff on public.titan_lead_playbooks;
create policy titan_lead_playbooks_staff on public.titan_lead_playbooks for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

drop policy if exists titan_daily_hunt_tasks_staff on public.titan_daily_hunt_tasks;
create policy titan_daily_hunt_tasks_staff on public.titan_daily_hunt_tasks for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

drop policy if exists titan_competitor_insights_staff on public.titan_competitor_insights;
create policy titan_competitor_insights_staff on public.titan_competitor_insights for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

-- Seed Gloss Boss playbooks (idempotent)
insert into public.titan_lead_playbooks (workspace_key, title, platform, search_query, target_customer, intent_to_find, example_phrases, suggested_action, estimated_revenue_min, estimated_revenue_max, priority)
values
  ('default', 'Round Rock mobile detail', 'Facebook', 'mobile detailing Round Rock', 'Local homeowners', 'recommendation_request', array['need detail','mobile detailer'], 'Search FB groups, paste posts into Lead Radar', 150, 250, 90),
  ('default', 'Austin car detailer', 'Facebook', 'car detailer Austin', 'Austin drivers', 'recommendation_request', array['who does','recommend'], 'Reply with Gloss Boss mobile offer', 150, 275, 88),
  ('default', 'Interior cleaning posts', 'Facebook', 'interior car cleaning', 'Interior leads', 'interior_cleaning', array['stains','seats','odor'], 'Offer interior package + availability', 125, 200, 85),
  ('default', 'Who does detailing', 'Facebook', 'who does car detailing', 'ISO leads', 'recommendation_request', array['ISO','anyone know'], 'Fast reply wins — copy template', 150, 225, 92),
  ('default', 'Need car cleaned', 'Facebook', 'need my car cleaned', 'Warm demand', 'needs_detail', array['need cleaned','this weekend'], 'Offer weekend slot', 150, 250, 91),
  ('default', 'Car shampoo', 'Facebook', 'car shampoo', 'Interior/shampoo', 'interior_cleaning', array['shampoo','pet hair'], 'Interior detail pitch', 125, 190, 80),
  ('default', 'Seat stain removal', 'Facebook', 'stain removal car seat', 'Stain jobs', 'interior_cleaning', array['stains','seats'], 'Before/after + pricing', 140, 220, 82),
  ('default', 'BMW Austin detail', 'Facebook', 'BMW Austin detailing', 'Car club / BMW owners', 'needs_detail', array['BMW','club'], 'Premium detail positioning', 175, 350, 78),
  ('default', 'Tesla Austin detail', 'Facebook', 'Tesla Austin detailing', 'Tesla owners', 'needs_detail', array['Tesla','Model Y'], 'Ceramic / full detail offer', 175, 400, 79),
  ('default', 'Round Rock moms', 'Facebook', 'Round Rock moms car cleaning', 'Family vehicles', 'interior_cleaning', array['kids','minivan'], 'Family-friendly mobile pitch', 125, 200, 76),
  ('default', 'Austin car club', 'Facebook', 'Austin car club detailer', 'Car clubs', 'needs_detail', array['car club','meet'], 'Club group rate offer', 200, 500, 74),
  ('default', 'Nextdoor detailer', 'Nextdoor', 'car detailer', 'Neighbors', 'recommendation_request', array['recommend','detailer'], 'Neighbor-trust tone reply', 125, 200, 86),
  ('default', 'Nextdoor mobile', 'Nextdoor', 'mobile detailing', 'Local homeowners', 'needs_detail', array['mobile','come to me'], 'Mobile convenience angle', 150, 225, 84),
  ('default', 'Nextdoor interior', 'Nextdoor', 'interior cleaning', 'Interior leads', 'interior_cleaning', array['interior','clean'], 'Interior package reply', 125, 190, 83),
  ('default', 'Nextdoor car wash rec', 'Nextdoor', 'car wash recommendation', 'Price shoppers', 'recommendation_request', array['car wash','recommend'], 'Mobile premium vs wash', 85, 175, 75),
  ('default', 'Apartments Round Rock', 'Google', 'apartment complexes Round Rock TX', 'Property managers', 'apartment_resident_event', array['residents','HOA'], 'Resident detail day pitch', 1500, 5000, 70),
  ('default', 'Property mgmt Austin', 'Google', 'property management companies Austin TX', 'PM companies', 'apartment_resident_event', array['property manager'], 'B2B email/call script', 2000, 6000, 72),
  ('default', 'Used dealers Round Rock', 'Google', 'used car dealers Round Rock', 'Dealerships', 'fleet_cleaning', array['lot','inventory'], 'Lot detailing program', 800, 4000, 68),
  ('default', 'Fleet Austin', 'Google', 'fleet companies Austin', 'Fleet ops', 'fleet_cleaning', array['fleet','vehicles'], 'Fleet manager outreach', 1500, 8000, 71),
  ('default', 'RV parks Austin', 'Google', 'RV parks near Austin', 'RV parks', 'apartment_resident_event', array['RV','residents'], 'On-site detail days', 500, 2500, 65),
  ('default', 'Marinas Austin', 'Google', 'marinas near Austin', 'Marinas', 'fleet_cleaning', array['boats','marina'], 'Boat + vehicle combo pitch', 400, 2000, 64),
  ('default', 'Office parks Round Rock', 'Google', 'office parks Round Rock', 'Office tenants', 'fleet_cleaning', array['employees','parking'], 'Employee detail day', 800, 3000, 66),
  ('default', 'Reddit Austin detail', 'Reddit', 'Austin car detailing', 'Reddit users', 'recommendation_request', array['detail','Austin'], 'Helpful non-spam reply', 125, 225, 77),
  ('default', 'Reddit Round Rock wash', 'Reddit', 'Round Rock car wash', 'Local Reddit', 'price_shopping', array['car wash','detail'], 'Value + mobile pitch', 85, 175, 73),
  ('default', 'Reddit Tesla Austin', 'Reddit', 'Tesla Austin', 'Tesla community', 'needs_detail', array['Tesla','detail'], 'Tesla-safe products mention', 175, 350, 74),
  ('default', 'Reddit BMW Austin', 'Reddit', 'BMW Austin', 'BMW community', 'needs_detail', array['BMW','detail'], 'Premium detail offer', 175, 350, 74)
on conflict (workspace_key, platform, search_query) do nothing;

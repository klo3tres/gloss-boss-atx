-- Titan autonomy: daily mission tracking + deal pipeline

create table if not exists public.titan_mission_actions (
  id uuid primary key default gen_random_uuid(),
  mission_date date not null default (timezone('America/Chicago', now()))::date,
  title text not null,
  potential_cents integer not null default 0,
  source_id text,
  outreach_json jsonb,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists titan_mission_actions_date_idx on public.titan_mission_actions (mission_date, status);

create table if not exists public.titan_deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null check (source_type in ('prospect', 'opportunity', 'fleet', 'partner', 'referral')),
  source_id text,
  potential_value_cents integer not null default 0,
  status text not null default 'new' check (
    status in ('new', 'contacted', 'proposal', 'negotiation', 'won', 'lost')
  ),
  last_touch_at timestamptz,
  next_action text,
  contact_name text,
  contact_phone text,
  contact_email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists titan_deals_status_idx on public.titan_deals (status, updated_at desc);

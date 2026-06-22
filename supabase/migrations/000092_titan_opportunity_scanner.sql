-- Titan Opportunity Scanner: buying signals, scoring, hunt tracking.
-- Compliant: stores operator-curated and public opportunities only (no private scraping).

create table if not exists public.titan_opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  source_platform text not null default 'manual' check (
    source_platform in (
      'manual', 'facebook_group', 'nextdoor', 'google_review',
      'community_board', 'public_web', 'referral', 'other'
    )
  ),
  source_label text,
  source_url text,
  keyword_matched text,
  author_name text,
  posted_at timestamptz,
  comments_count integer not null default 0,
  engagement_level text not null default 'low' check (engagement_level in ('low', 'medium', 'high')),
  opportunity_type text not null default 'homeowner' check (
    opportunity_type in ('homeowner', 'fleet', 'apartment', 'dealership', 'b2b', 'pressure_wash', 'landscaping', 'other')
  ),
  tier text not null default 'medium' check (tier in ('easy', 'medium', 'high_impact', 'whale')),
  score integer not null default 0,
  urgency_score integer not null default 0,
  competition_score integer not null default 0,
  value_cents integer not null default 0,
  close_likelihood_percent integer not null default 0,
  status text not null default 'new' check (
    status in ('new', 'contacted', 'replied', 'pipeline', 'won', 'lost', 'dismissed')
  ),
  suggested_reply text,
  suggested_dm text,
  lead_id uuid references public.leads (id) on delete set null,
  contacted_at timestamptz,
  won_at timestamptz,
  lost_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_titan_opportunities_score on public.titan_opportunities (score desc, status, posted_at desc);
create index if not exists idx_titan_opportunities_status on public.titan_opportunities (status, created_at desc);

create table if not exists public.titan_opportunity_hunts (
  id uuid primary key default gen_random_uuid(),
  hunt_date date not null unique,
  opportunity_count integer not null default 0,
  potential_cents integer not null default 0,
  by_type jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.titan_opportunities enable row level security;
alter table public.titan_opportunity_hunts enable row level security;

drop policy if exists titan_opportunities_staff on public.titan_opportunities;
create policy titan_opportunities_staff on public.titan_opportunities for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

drop policy if exists titan_opportunity_hunts_staff on public.titan_opportunity_hunts;
create policy titan_opportunity_hunts_staff on public.titan_opportunity_hunts for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

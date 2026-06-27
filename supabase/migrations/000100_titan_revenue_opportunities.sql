-- Titan Opportunity Engine v1: revenue hunt fields + outcome events

alter table public.titan_opportunities add column if not exists workspace_key text not null default 'default';
alter table public.titan_opportunities add column if not exists contact_phone text;
alter table public.titan_opportunities add column if not exists contact_email text;
alter table public.titan_opportunities add column if not exists recommended_action text;
alter table public.titan_opportunities add column if not exists why_surfaced text;
alter table public.titan_opportunities add column if not exists last_touched_at timestamptz;
alter table public.titan_opportunities add column if not exists next_follow_up_at timestamptz;
alter table public.titan_opportunities add column if not exists confidence_score integer not null default 50;
alter table public.titan_opportunities add column if not exists source_label_custom text;

-- Relax legacy check constraints so revenue types/statuses work
alter table public.titan_opportunities drop constraint if exists titan_opportunities_opportunity_type_check;
alter table public.titan_opportunities drop constraint if exists titan_opportunities_status_check;

alter table public.titan_opportunities add constraint titan_opportunities_opportunity_type_check check (
  opportunity_type in (
    'warm_lead', 'canceled_reschedule', 'previous_customer', 'referral', 'apartment_hoa',
    'fleet', 'dealership', 'coworker_nurse', 'facebook_group', 'nextdoor', 'google_places',
    'manual_prospect', 'homeowner', 'apartment', 'b2b', 'pressure_wash', 'landscaping', 'other'
  )
);

alter table public.titan_opportunities add constraint titan_opportunities_status_check check (
  status in (
    'new', 'contacted', 'follow_up', 'booked', 'lost', 'ignored',
    'replied', 'pipeline', 'won', 'dismissed'
  )
);

create index if not exists idx_titan_opportunities_workspace on public.titan_opportunities (workspace_key, status, created_at desc);
create index if not exists idx_titan_opportunities_type on public.titan_opportunities (opportunity_type, status);
create index if not exists idx_titan_opportunities_follow_up on public.titan_opportunities (next_follow_up_at, status);

create table if not exists public.titan_opportunity_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.titan_opportunities (id) on delete cascade,
  event_type text not null,
  notes text,
  workspace_key text not null default 'default',
  created_at timestamptz not null default now()
);

create index if not exists idx_titan_opportunity_events_opp on public.titan_opportunity_events (opportunity_id, created_at desc);
create index if not exists idx_titan_opportunity_events_workspace on public.titan_opportunity_events (workspace_key, created_at desc);

alter table public.titan_opportunity_events enable row level security;

drop policy if exists titan_opportunity_events_staff on public.titan_opportunity_events;
create policy titan_opportunity_events_staff on public.titan_opportunity_events for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

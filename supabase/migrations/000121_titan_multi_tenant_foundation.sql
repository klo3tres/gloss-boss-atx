-- Titan multi-tenant SaaS foundation (Gloss Boss = first tenant)

-- Fixed UUID for Gloss Boss default tenant (backward compatible with workspace_key 'default')
-- a0000000-0000-4000-8000-000000000001

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null unique,
  slug text not null unique,
  name text not null,
  legal_name text,
  industry text not null default 'mobile_detailing',
  status text not null default 'active' check (status in ('active', 'trial', 'suspended', 'archived')),
  is_platform_tenant boolean not null default false,
  website_url text,
  support_email text,
  support_phone text,
  timezone text not null default 'America/Chicago',
  onboarding_step integer not null default 0,
  onboarding_completed_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_businesses_slug on public.businesses (slug);
create index if not exists idx_businesses_status on public.businesses (status);

create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  invited_email text,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists idx_business_members_user on public.business_members (user_id);
create index if not exists idx_business_members_business on public.business_members (business_id, role);

create table if not exists public.titan_industry_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  profile_key text not null,
  label text not null,
  opportunity_types jsonb not null default '[]'::jsonb,
  action_types jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, profile_key)
);

create table if not exists public.titan_followup_sequences (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  industry_profile_id uuid references public.titan_industry_profiles (id) on delete set null,
  name text not null,
  is_default boolean not null default false,
  snooze_days integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_titan_followup_sequences_business on public.titan_followup_sequences (business_id, is_default);

create table if not exists public.titan_followup_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.titan_followup_sequences (id) on delete cascade,
  step_order integer not null default 0,
  delay_days integer not null default 0,
  label text not null,
  channel text not null default 'sms' check (channel in ('sms', 'email', 'call_script', 'any')),
  sms_template text not null default '',
  email_subject text not null default '',
  email_body text not null default '',
  call_script text not null default '',
  created_at timestamptz not null default now(),
  unique (sequence_id, step_order)
);

create table if not exists public.business_integrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  integration_type text not null check (
    integration_type in (
      'google_calendar', 'gmail', 'stripe', 'twilio', 'website_forms', 'resend', 'meta', 'other'
    )
  ),
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error', 'pending')),
  connected_account text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  permissions jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  sync_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, integration_type, user_id)
);

create index if not exists idx_business_integrations_business on public.business_integrations (business_id, integration_type);

create table if not exists public.business_api_keys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null default 'Website forms',
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default array['leads:write']::text[],
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_business_api_keys_hash on public.business_api_keys (key_hash) where revoked_at is null;
create index if not exists idx_business_api_keys_business on public.business_api_keys (business_id);

create table if not exists public.business_contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  company text,
  source text,
  customer_id uuid references public.customers (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_contacts_business on public.business_contacts (business_id, created_at desc);
create index if not exists idx_business_contacts_email on public.business_contacts (business_id, lower(email));
create index if not exists idx_business_contacts_phone on public.business_contacts (business_id, phone);

create table if not exists public.external_leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  contact_id uuid references public.business_contacts (id) on delete set null,
  opportunity_id uuid,
  source text not null default 'api',
  name text,
  phone text,
  email text,
  company text,
  service_interest text,
  budget text,
  timeline text,
  message text,
  page_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'matched', 'converted', 'spam', 'archived')),
  api_key_id uuid references public.business_api_keys (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_external_leads_business on public.external_leads (business_id, created_at desc);
create index if not exists idx_external_leads_status on public.external_leads (business_id, status);

create table if not exists public.titan_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  action_type text not null,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'dismissed', 'scheduled')),
  priority integer not null default 50,
  entity_type text,
  entity_id text,
  contact_phone text,
  contact_email text,
  message_script text,
  scheduled_for timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_titan_actions_business on public.titan_actions (business_id, status, created_at desc);

create table if not exists public.titan_opportunity_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  opportunity_id uuid not null,
  followup_step_id uuid references public.titan_followup_steps (id) on delete set null,
  channel text not null check (channel in ('sms', 'email', 'call_script')),
  subject text,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sent', 'skipped', 'failed')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_titan_opp_messages_opp on public.titan_opportunity_messages (opportunity_id, created_at desc);

create table if not exists public.titan_connection_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  integration_type text,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_titan_connection_events_business on public.titan_connection_events (business_id, created_at desc);

create table if not exists public.titan_projects (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  contact_id uuid references public.business_contacts (id) on delete set null,
  opportunity_id uuid,
  title text not null,
  project_type text not null default 'service_job',
  status text not null default 'planned' check (status in ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
  value_cents integer not null default 0,
  starts_at timestamptz,
  due_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_titan_projects_business on public.titan_projects (business_id, status, created_at desc);

-- business_id on existing Titan tables
alter table public.titan_opportunities add column if not exists business_id uuid references public.businesses (id) on delete cascade;
alter table public.titan_opportunity_events add column if not exists business_id uuid references public.businesses (id) on delete cascade;
alter table public.titan_lead_radar_items add column if not exists business_id uuid references public.businesses (id) on delete cascade;
alter table public.titan_notification_events add column if not exists business_id uuid references public.businesses (id) on delete cascade;
alter table public.titan_daily_actions add column if not exists business_id uuid references public.businesses (id) on delete cascade;
alter table public.google_calendar_connections add column if not exists business_id uuid references public.businesses (id) on delete cascade;
alter table public.google_calendar_connections add column if not exists user_id uuid references auth.users (id) on delete set null;

alter table public.titan_opportunities add column if not exists industry_profile_key text;
alter table public.titan_opportunities add column if not exists followup_sequence_id uuid references public.titan_followup_sequences (id) on delete set null;
alter table public.titan_opportunities add column if not exists external_lead_id uuid references public.external_leads (id) on delete set null;

-- Relax opportunity_type for multi-industry
alter table public.titan_opportunities drop constraint if exists titan_opportunities_opportunity_type_check;

alter table public.titan_opportunities add constraint titan_opportunities_opportunity_type_check check (
  opportunity_type in (
    'warm_lead', 'canceled_reschedule', 'previous_customer', 'referral', 'apartment_hoa',
    'fleet', 'dealership', 'coworker_nurse', 'facebook_group', 'nextdoor', 'google_places',
    'manual_prospect', 'homeowner', 'apartment', 'b2b', 'pressure_wash', 'landscaping', 'other',
    'detailing_booking', 'fleet_quote', 'membership_upsell', 'review_request', 'rebook_reminder', 'referral_follow_up',
    'website_project', 'redesign', 'seo', 'hosting', 'maintenance', 'ads', 'consultation',
    'proposal_follow_up', 'project_milestone', 'testimonial_referral', 'external_lead'
  )
);

alter table public.titan_opportunities drop constraint if exists titan_opportunities_status_check;
alter table public.titan_opportunities add constraint titan_opportunities_status_check check (
  status in (
    'new', 'seeded', 'contacted', 'quoted', 'follow_up', 'booked', 'lost', 'ignored', 'snoozed',
    'replied', 'pipeline', 'won', 'dismissed'
  )
);

create index if not exists idx_titan_opportunities_business on public.titan_opportunities (business_id, status, created_at desc);

-- Seed Gloss Boss as first tenant
insert into public.businesses (
  id, workspace_key, slug, name, legal_name, industry, is_platform_tenant, website_url, onboarding_completed_at
)
values (
  'a0000000-0000-4000-8000-000000000001',
  'default',
  'gloss-boss-atx',
  'Gloss Boss ATX',
  'Gloss Boss ATX LLC',
  'mobile_detailing',
  true,
  'https://www.glossbossatx.com',
  now()
)
on conflict (workspace_key) do update set
  name = excluded.name,
  is_platform_tenant = true,
  updated_at = now();

-- Backfill business_id on existing rows
update public.titan_opportunities set business_id = 'a0000000-0000-4000-8000-000000000001' where business_id is null;
update public.titan_opportunity_events set business_id = 'a0000000-0000-4000-8000-000000000001' where business_id is null;
update public.titan_lead_radar_items set business_id = 'a0000000-0000-4000-8000-000000000001' where business_id is null;
update public.titan_notification_events set business_id = 'a0000000-0000-4000-8000-000000000001' where business_id is null;
update public.titan_daily_actions set business_id = 'a0000000-0000-4000-8000-000000000001' where business_id is null;
update public.google_calendar_connections set business_id = 'a0000000-0000-4000-8000-000000000001' where business_id is null;

-- System industry profiles
insert into public.titan_industry_profiles (business_id, profile_key, label, opportunity_types, action_types, is_system)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    'mobile_detailing',
    'Mobile Detailing',
    '["detailing_booking","fleet_quote","membership_upsell","review_request","rebook_reminder","referral_follow_up","fleet","warm_lead","manual_prospect"]'::jsonb,
    '["outreach","follow_up","quote","review","rebook","referral"]'::jsonb,
    true
  ),
  (
    null,
    'web_agency',
    'Web Agency / Growth',
    '["website_project","redesign","seo","hosting","maintenance","ads","consultation","proposal_follow_up","project_milestone","testimonial_referral","external_lead"]'::jsonb,
    '["pitch","follow_up","proposal","milestone","testimonial"]'::jsonb,
    true
  )
on conflict (business_id, profile_key) do nothing;

-- Default follow-up sequence for Gloss Boss
insert into public.titan_followup_sequences (id, business_id, name, is_default, snooze_days)
values (
  'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'Standard outreach (Day 0 / 2 / 7 / 14)',
  true,
  60
)
on conflict do nothing;

insert into public.titan_followup_steps (sequence_id, step_order, delay_days, label, channel, sms_template, email_subject, email_body, call_script)
values
  ('b0000000-0000-4000-8000-000000000001', 0, 0, 'Day 0 — First pitch', 'any', 'Hi {{contact}}, following up from {{business}}. {{pitch}}', 'Quick intro from {{business}}', 'Hi {{contact}},\n\n{{pitch}}\n\n— {{business}}', 'Hey {{contact}}, this is {{owner}} with {{business}}. Quick intro — do you have a moment?'),
  ('b0000000-0000-4000-8000-000000000001', 1, 2, 'Day 2 — Follow-up', 'sms', 'Hi {{contact}} — checking in from {{business}}. Still happy to help. Want me to send details?', 'Following up', 'Hi {{contact}},\n\nJust checking in — happy to send pricing or next steps.\n\n— {{business}}', 'Following up from {{business}} — still a good time to chat?'),
  ('b0000000-0000-4000-8000-000000000001', 2, 7, 'Day 7 — Value follow-up', 'sms', 'Hi {{contact}} — {{business}} here. Wanted to share how we help similar clients: {{value}}. Open to a quick call?', 'Value follow-up', 'Hi {{contact}},\n\n{{value}}\n\n— {{business}}', 'Wanted to share a quick win we deliver for clients like you.'),
  ('b0000000-0000-4000-8000-000000000001', 3, 14, 'Day 14 — Final check-in', 'sms', 'Last check-in from {{business}} — want me to close the loop or revisit later?', 'Final check-in', 'Hi {{contact}},\n\nLast check-in from our side. Reply anytime if timing improves.\n\n— {{business}}', 'Final friendly check-in — should I close the loop or revisit next month?')
on conflict do nothing;

-- RLS (staff access; service role bypasses)
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_integrations enable row level security;
alter table public.business_api_keys enable row level security;
alter table public.external_leads enable row level security;
alter table public.business_contacts enable row level security;
alter table public.titan_actions enable row level security;
alter table public.titan_projects enable row level security;

drop policy if exists businesses_staff_read on public.businesses;
create policy businesses_staff_read on public.businesses for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin', 'dispatcher', 'viewer'))
  or exists (select 1 from public.business_members bm where bm.business_id = businesses.id and bm.user_id = auth.uid())
);

drop policy if exists business_members_self on public.business_members;
create policy business_members_self on public.business_members for select using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin'))
);

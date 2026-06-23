-- Titan proof, learning, and distribution layer

-- Action outcomes on daily mission items
alter table public.titan_mission_actions
  add column if not exists outcome text check (
    outcome is null or outcome in (
      'no_response', 'replied', 'asked_price', 'booked', 'declined',
      'rescheduled', 'became_customer', 'revenue_collected', 'ignored'
    )
  ),
  add column if not exists outcome_notes text,
  add column if not exists outcome_at timestamptz,
  add column if not exists attributed_revenue_cents integer not null default 0;

-- Closed-loop attribution: connect Titan actions to leads/appointments/payments
create table if not exists public.titan_attributions (
  id uuid primary key default gen_random_uuid(),
  action_type text not null check (
    action_type in ('mission_action', 'outreach_play', 'deal', 'offer', 'referral')
  ),
  action_id text not null,
  lead_id uuid references public.leads (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  payment_id uuid,
  attributed_revenue_cents integer not null default 0,
  match_method text not null default 'manual' check (
    match_method in ('manual', 'auto_phone', 'auto_email', 'auto_source', 'auto_timing')
  ),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists titan_attributions_action_idx on public.titan_attributions (action_type, action_id);
create index if not exists titan_attributions_payment_idx on public.titan_attributions (payment_id) where payment_id is not null;

-- Scheduled follow-up cadence (Wed/Fri after Monday contact, etc.)
create table if not exists public.titan_touch_schedule (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.titan_prospects (id) on delete cascade,
  deal_id uuid references public.titan_deals (id) on delete cascade,
  mission_action_id uuid references public.titan_mission_actions (id) on delete cascade,
  channel text not null check (channel in ('sms', 'email', 'call', 'facebook', 'nextdoor')),
  message text not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'cancelled')),
  sent_at timestamptz,
  outcome text,
  created_at timestamptz not null default now()
);

create index if not exists titan_touch_schedule_due_idx on public.titan_touch_schedule (status, due_at);

-- Contact enrichment on prospects
alter table public.titan_prospects
  add column if not exists website text,
  add column if not exists decision_maker_title text,
  add column if not exists enrichment_notes text,
  add column if not exists acquisition_source text;

-- Titan offers (Georgetown SUV Week, Fleet Friday, etc.)
create table if not exists public.titan_offers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  territory text,
  service_focus text,
  discount_label text,
  promo_code text,
  outreach_sms text,
  outreach_email_subject text,
  outreach_email_body text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  starts_at timestamptz,
  ends_at timestamptz,
  leads_count integer not null default 0,
  bookings_count integer not null default 0,
  revenue_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists titan_offers_status_idx on public.titan_offers (status, created_at desc);

-- Required job closeout checklist (review + referral lock-in)
create table if not exists public.titan_job_closeouts (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments (id) on delete cascade,
  review_requested_at timestamptz,
  review_completed_at timestamptz,
  referral_requested_at timestamptz,
  referral_completed_at timestamptz,
  discount_offered_at timestamptz,
  follow_up_sent_at timestamptz,
  status text not null default 'pending' check (
    status in ('pending', 'review_sent', 'referral_sent', 'complete', 'skipped')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists titan_job_closeouts_status_idx on public.titan_job_closeouts (status, created_at desc);

-- Workspace: demo mode, onboarding, subscription foundation
alter table public.titan_workspace_settings
  add column if not exists demo_mode boolean not null default false,
  add column if not exists onboarding_step integer not null default 0,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists subscription_tier text not null default 'none' check (
    subscription_tier in ('none', 'starter', 'growth', 'scale')
  ),
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text;

-- Subscription plan catalog (Titan SaaS)
create table if not exists public.titan_subscription_plans (
  id text primary key,
  name text not null,
  price_cents integer not null,
  stripe_price_id text,
  features jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0
);

insert into public.titan_subscription_plans (id, name, price_cents, features, sort_order)
values
  ('starter', 'Titan Starter', 4900, '["Daily Manager","Outreach Engine","Goal Engine"]'::jsonb, 1),
  ('growth', 'Titan Growth', 14900, '["Everything in Starter","Deal Room","Attribution","Territory"]'::jsonb, 2),
  ('scale', 'Titan Scale', 29900, '["Everything in Growth","Fleet Engine","Multi-user","White label"]'::jsonb, 3)
on conflict (id) do nothing;

-- Learning insights cache (aggregated from outcomes)
create table if not exists public.titan_learning_insights (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  insight text not null,
  evidence jsonb not null default '{}'::jsonb,
  confidence_percent integer not null default 50,
  created_at timestamptz not null default now()
);

create index if not exists titan_learning_insights_cat_idx on public.titan_learning_insights (category, created_at desc);

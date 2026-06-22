-- Titan Growth OS: prospects, outreach, ad spend, content, command plans.

create table if not exists public.titan_prospects (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  prospect_type text not null default 'other' check (
    prospect_type in (
      'apartment_complex', 'dealership', 'fleet_operator', 'construction',
      'landscaping', 'property_manager', 'hoa', 'realtor', 'other'
    )
  ),
  contact_name text,
  contact_role text,
  email text,
  phone text,
  address text,
  distance_miles numeric,
  estimated_monthly_cents integer not null default 0,
  vehicle_count integer,
  score integer not null default 0,
  score_reason text,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'pipeline', 'won', 'lost')),
  source text not null default 'manual',
  fleet_inquiry_id uuid,
  lead_id uuid references public.leads (id) on delete set null,
  notes text,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_titan_prospects_score on public.titan_prospects (score desc, status);
create index if not exists idx_titan_prospects_status on public.titan_prospects (status, created_at desc);

create table if not exists public.titan_outreach_plays (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.titan_prospects (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  channel text not null check (channel in ('call', 'email', 'sms', 'visit')),
  call_script text,
  email_subject text,
  email_body text,
  sms_body text,
  follow_up_days integer not null default 3,
  status text not null default 'draft' check (status in ('draft', 'sent', 'failed', 'scheduled')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_spend (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  period_key text not null,
  spend_cents integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, period_key)
);

create table if not exists public.titan_content_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'instagram',
  title text not null,
  hook text,
  caption text,
  views integer not null default 0,
  leads_count integer not null default 0,
  bookings_count integer not null default 0,
  revenue_cents integer not null default 0,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.titan_command_plans (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'executed', 'cancelled')),
  potential_revenue_cents integer not null default 0,
  actions jsonb not null default '[]'::jsonb,
  execution_log jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.leads add column if not exists marketing_channel text;
alter table public.appointments add column if not exists marketing_channel text;
alter table public.appointments add column if not exists utm_source text;
alter table public.appointments add column if not exists utm_medium text;
alter table public.appointments add column if not exists utm_campaign text;

alter table public.titan_prospects enable row level security;
alter table public.titan_outreach_plays enable row level security;
alter table public.marketing_spend enable row level security;
alter table public.titan_content_posts enable row level security;
alter table public.titan_command_plans enable row level security;

drop policy if exists titan_prospects_staff on public.titan_prospects;
create policy titan_prospects_staff on public.titan_prospects for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

drop policy if exists titan_outreach_staff on public.titan_outreach_plays;
create policy titan_outreach_staff on public.titan_outreach_plays for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

drop policy if exists marketing_spend_staff on public.marketing_spend;
create policy marketing_spend_staff on public.marketing_spend for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

drop policy if exists titan_content_staff on public.titan_content_posts;
create policy titan_content_staff on public.titan_content_posts for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

drop policy if exists titan_command_staff on public.titan_command_plans;
create policy titan_command_staff on public.titan_command_plans for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

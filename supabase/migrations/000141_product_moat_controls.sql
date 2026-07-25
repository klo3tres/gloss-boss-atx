-- Product moat controls: universal quotes, evidence-backed Titan learning,
-- policy-bounded autonomy, and auditable integrity repairs.

alter table public.service_estimates
  add column if not exists opportunity_id uuid,
  add column if not exists assigned_technician_id uuid references public.profiles(id) on delete set null,
  add column if not exists vehicles jsonb not null default '[]'::jsonb,
  add column if not exists pricing_inputs jsonb not null default '{}'::jsonb,
  add column if not exists pricing_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists warnings jsonb not null default '[]'::jsonb,
  add column if not exists labor_minutes integer not null default 0,
  add column if not exists estimated_cost_cents integer not null default 0,
  add column if not exists estimated_margin_cents integer not null default 0,
  add column if not exists minimum_profitable_cents integer not null default 0,
  add column if not exists payment_preference text,
  add column if not exists accepted_at timestamptz,
  add column if not exists owner_declined_at timestamptz,
  add column if not exists viewed_at timestamptz,
  add column if not exists scheduled_delivery_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;

alter table public.service_estimates drop constraint if exists service_estimates_status_check;
alter table public.service_estimates add constraint service_estimates_status_check
  check (status in ('draft','scheduled','sent','viewed','approved','declined','deposit_paid','converted','expired','voided'));

create table if not exists public.service_estimate_events (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.service_estimates(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  channel text,
  provider_status text,
  related_record jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists service_estimate_events_estimate_idx on public.service_estimate_events(estimate_id,created_at desc);
alter table public.service_estimate_events enable row level security;
drop policy if exists service_estimate_events_admin_all on public.service_estimate_events;
create policy service_estimate_events_admin_all on public.service_estimate_events
  for all using (public.is_admin_level()) with check (public.is_admin_level());

create index if not exists service_estimates_customer_updated_idx
  on public.service_estimates(customer_id, updated_at desc);

create table if not exists public.titan_recommendation_outcomes (
  id uuid primary key default gen_random_uuid(),
  workflow text not null,
  recommendation text not null,
  supporting_records jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  predicted_outcome jsonb not null default '{}'::jsonb,
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  owner_decision text not null default 'pending'
    check (owner_decision in ('pending','accepted','ignored','rejected')),
  execution jsonb not null default '{}'::jsonb,
  actual_result jsonb not null default '{}'::jsonb,
  revenue_cents integer not null default 0,
  margin_cents integer not null default 0,
  time_saved_minutes integer not null default 0,
  accuracy numeric(5,4),
  learned_adjustment jsonb not null default '{}'::jsonb,
  decided_at timestamptz,
  evaluated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists titan_recommendation_outcomes_workflow_idx
  on public.titan_recommendation_outcomes(workflow, created_at desc);

create table if not exists public.titan_autonomy_policies (
  workflow text primary key,
  mode text not null default 'recommend'
    check (mode in ('observe','recommend','prepare','approval_required','autopilot')),
  enabled boolean not null default true,
  spending_limit_cents integer not null default 0,
  discount_limit_bps integer not null default 1000,
  audience_limit integer not null default 50,
  quiet_hours_start smallint not null default 20 check (quiet_hours_start between 0 and 23),
  quiet_hours_end smallint not null default 8 check (quiet_hours_end between 0 and 23),
  approval_threshold_cents integer not null default 0,
  require_consent boolean not null default true,
  require_capacity boolean not null default true,
  emergency_stopped boolean not null default false,
  policy jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.titan_autonomy_policies(workflow)
select unnest(array[
  'campaigns','customer_followups','payment_reminders','scheduling',
  'quote_followups','reviews','referrals','weather_outreach',
  'pricing_recommendations','appointment_delay_notifications'
])
on conflict (workflow) do nothing;

create table if not exists public.business_integrity_repairs (
  id uuid primary key default gen_random_uuid(),
  issue_key text not null,
  related_records jsonb not null default '[]'::jsonb,
  impact_cents integer not null default 0,
  repair_action text not null,
  status text not null default 'proposed'
    check (status in ('proposed','confirmed','completed','failed','rolled_back')),
  sensitive boolean not null default false,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  error_message text,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.titan_recommendation_outcomes enable row level security;
alter table public.titan_autonomy_policies enable row level security;
alter table public.business_integrity_repairs enable row level security;

drop policy if exists titan_recommendation_outcomes_admin_all on public.titan_recommendation_outcomes;
create policy titan_recommendation_outcomes_admin_all on public.titan_recommendation_outcomes
  for all using (public.is_admin_level()) with check (public.is_admin_level());
drop policy if exists titan_autonomy_policies_admin_all on public.titan_autonomy_policies;
create policy titan_autonomy_policies_admin_all on public.titan_autonomy_policies
  for all using (public.is_admin_level()) with check (public.is_admin_level());
drop policy if exists business_integrity_repairs_admin_all on public.business_integrity_repairs;
create policy business_integrity_repairs_admin_all on public.business_integrity_repairs
  for all using (public.is_admin_level()) with check (public.is_admin_level());

insert into public.site_settings(key,value)
values ('migration_marker_000141', jsonb_build_object('name','product_moat_controls','applied',true,'version',141))
on conflict (key) do update set value=excluded.value, updated_at=now();

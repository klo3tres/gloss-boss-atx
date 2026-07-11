create table if not exists public.titan_automation_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  trigger text not null default 'cron' check (trigger in ('cron', 'manual')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  result jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists titan_automation_runs_job_started_idx
  on public.titan_automation_runs (job_key, started_at desc);
create unique index if not exists titan_automation_runs_one_running_idx
  on public.titan_automation_runs (job_key) where status = 'running';

create table if not exists public.titan_action_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  action_type text not null,
  entity_type text,
  entity_id text,
  opportunity_id uuid references public.titan_opportunities(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  message_id uuid,
  channel text,
  tone text,
  status text,
  amount_cents integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists titan_action_events_entity_idx on public.titan_action_events (entity_type, entity_id, occurred_at desc);
create index if not exists titan_action_events_type_idx on public.titan_action_events (event_type, occurred_at desc);
create index if not exists titan_action_events_opportunity_idx on public.titan_action_events (opportunity_id, occurred_at desc);

alter table public.titan_automation_runs enable row level security;
alter table public.titan_action_events enable row level security;

drop policy if exists titan_automation_runs_admin on public.titan_automation_runs;
create policy titan_automation_runs_admin on public.titan_automation_runs for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);
drop policy if exists titan_action_events_staff on public.titan_action_events;
create policy titan_action_events_staff on public.titan_action_events for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin', 'dispatcher'))
);

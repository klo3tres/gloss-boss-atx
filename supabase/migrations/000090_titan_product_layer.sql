-- Titan product layer: workspace DNA + activity feed.

create table if not exists public.titan_workspace_settings (
  workspace_key text primary key default 'default',
  business_name text not null default 'My Business',
  industry text not null default 'mobile_detailing',
  business_type text not null default 'service',
  revenue_model text not null default 'per_job',
  service_radius_miles numeric not null default 15,
  employee_count integer not null default 1,
  operating_hours jsonb not null default '{"mon":"8-18","tue":"8-18","wed":"8-18","thu":"8-18","fri":"8-18","sat":"9-14","sun":"closed"}'::jsonb,
  monthly_revenue_goal_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.titan_workspace_settings (workspace_key)
values ('default')
on conflict (workspace_key) do nothing;

create table if not exists public.titan_activity_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  detail text,
  impact_cents integer not null default 0,
  href text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_titan_activity_occurred on public.titan_activity_events (occurred_at desc);
create index if not exists idx_titan_activity_kind on public.titan_activity_events (kind, occurred_at desc);

alter table public.titan_workspace_settings enable row level security;
alter table public.titan_activity_events enable row level security;

drop policy if exists titan_workspace_staff on public.titan_workspace_settings;
create policy titan_workspace_staff on public.titan_workspace_settings for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

drop policy if exists titan_activity_staff on public.titan_activity_events;
create policy titan_activity_staff on public.titan_activity_events for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

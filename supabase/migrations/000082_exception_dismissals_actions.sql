-- Owner exception dismissals and action audit trail.
-- Apply after 000081_business_exception_inbox.sql.

create table if not exists public.exception_dismissals (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  dismissed_by uuid references public.profiles(id) on delete set null,
  note text,
  snooze_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_exception_dismissals_snooze
  on public.exception_dismissals (snooze_until, created_at desc);

create table if not exists public.exception_actions (
  id uuid primary key default gen_random_uuid(),
  fingerprint text,
  action_type text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_exception_actions_fingerprint
  on public.exception_actions (fingerprint, created_at desc);

alter table public.exception_dismissals enable row level security;
alter table public.exception_actions enable row level security;

drop policy if exists exception_dismissals_staff_all on public.exception_dismissals;
create policy exception_dismissals_staff_all on public.exception_dismissals for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin','super_admin'))
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin','super_admin'))
);

drop policy if exists exception_actions_staff_all on public.exception_actions;
create policy exception_actions_staff_all on public.exception_actions for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin','super_admin'))
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin','super_admin'))
);

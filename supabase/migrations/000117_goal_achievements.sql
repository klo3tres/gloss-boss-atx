-- Staff achievements + goal gamification loop

create table if not exists public.staff_achievements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null,
  title text not null,
  description text,
  tier text,
  goal_id uuid references public.admin_goals(id) on delete set null,
  source_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  earned_at timestamptz not null default now(),
  seen_at timestamptz
);

create unique index if not exists staff_achievements_unique_key
  on public.staff_achievements (profile_id, achievement_key, source_id);

create index if not exists staff_achievements_profile_idx
  on public.staff_achievements (profile_id, earned_at desc);

create index if not exists staff_achievements_goal_idx
  on public.staff_achievements (goal_id);

alter table public.staff_achievements enable row level security;

drop policy if exists staff_achievements_staff_select on public.staff_achievements;
create policy staff_achievements_staff_select
  on public.staff_achievements for select to authenticated
  using (public.is_staff());

drop policy if exists staff_achievements_self_select on public.staff_achievements;
create policy staff_achievements_self_select
  on public.staff_achievements for select to authenticated
  using (profile_id = auth.uid());

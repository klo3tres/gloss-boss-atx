-- P0: Repair infinite recursion on public.profiles RLS
-- Root cause: policy profiles_admin_select_staff (000015) selects from public.profiles
-- inside a profiles policy. That re-enters RLS → "infinite recursion detected in policy
-- for relation profiles".
--
-- Fix: recreate profiles policies using SECURITY DEFINER helpers with row_security off.
-- Do not DROP current_role() — other table policies depend on it.

-- Harden helpers in place (same signatures; no DROP needed for boolean helpers).
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (select role::text from public.profiles where id = auth.uid() limit 1)
      in ('super_admin', 'admin', 'dispatcher', 'technician', 'viewer'),
    false
  );
$$;

create or replace function public.is_admin_level()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (select role::text from public.profiles where id = auth.uid() limit 1)
      in ('super_admin', 'admin'),
    false
  );
$$;

-- Ensure current_role bypasses RLS when reading the caller's profile row.
do $$
begin
  begin
    execute 'alter function public.current_role() set search_path = public';
    execute 'alter function public.current_role() set row_security = off';
  exception
    when undefined_function then
      null;
    when others then
      raise notice 'current_role alter skipped: %', sqlerrm;
  end;
end $$;

revoke all on function public.is_staff() from public;
revoke all on function public.is_admin_level() from public;
grant execute on function public.is_staff() to authenticated, anon, service_role;
grant execute on function public.is_admin_level() to authenticated, anon, service_role;

-- Drop recursive / legacy select+update policies on profiles
drop policy if exists "profiles_select_self" on public.profiles;
drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_admin_select_staff on public.profiles;
drop policy if exists "profiles_select_own_row" on public.profiles;
drop policy if exists profiles_select_own_row on public.profiles;
drop policy if exists profiles_staff_select on public.profiles;
drop policy if exists profiles_admin_select on public.profiles;
drop policy if exists profiles_staff_select_roster on public.profiles;
drop policy if exists "profiles_insert_own_row" on public.profiles;
drop policy if exists profiles_insert_own_row on public.profiles;
drop policy if exists "profiles_update_own_row" on public.profiles;
drop policy if exists profiles_update_own_row on public.profiles;
drop policy if exists profiles_admin_update_staff on public.profiles;

-- Own row always readable
create policy profiles_select_own_row on public.profiles
  for select
  using (auth.uid() = id);

-- Admins may read staff roster (no recursive profiles subquery)
create policy profiles_admin_select_staff on public.profiles
  for select
  using (public.is_admin_level());

-- Staff may read other staff rows needed for dispatch (still via helper, not recursive)
create policy profiles_staff_select_roster on public.profiles
  for select
  using (
    public.is_staff()
    and role::text in ('super_admin', 'admin', 'dispatcher', 'technician', 'viewer')
  );

create policy profiles_insert_own_row on public.profiles
  for insert
  with check (auth.uid() = id);

create policy profiles_update_own_row on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy profiles_admin_update_staff on public.profiles
  for update
  using (public.is_admin_level())
  with check (public.is_admin_level());

-- Auth event audit (no tokens/passwords)
create table if not exists public.auth_event_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_user_id uuid,
  subject_user_id uuid,
  subject_email text,
  detail text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auth_event_log_created_idx on public.auth_event_log (created_at desc);
create index if not exists auth_event_log_subject_idx on public.auth_event_log (subject_user_id, created_at desc);

alter table public.auth_event_log enable row level security;

drop policy if exists auth_event_log_admin_read on public.auth_event_log;
create policy auth_event_log_admin_read on public.auth_event_log
  for select
  using (public.is_admin_level());

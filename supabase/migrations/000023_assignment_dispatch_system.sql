-- Dispatch assignment: lead/job columns, audit log, lead pool, expanded statuses.
-- Non-destructive: additive columns/tables/policies only.

-- ---------- Leads ----------
alter table public.leads add column if not exists assigned_technician_id uuid references public.profiles (id) on delete set null;
alter table public.leads add column if not exists assigned_by uuid references auth.users (id) on delete set null;
alter table public.leads add column if not exists assigned_at timestamptz;
alter table public.leads add column if not exists claimed_at timestamptz;
alter table public.leads add column if not exists in_pool boolean not null default false;
alter table public.leads add column if not exists customer_id uuid references public.customers (id) on delete set null;

update public.leads
set assigned_technician_id = assigned_to
where assigned_technician_id is null and assigned_to is not null;

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('new', 'assigned', 'claimed', 'contacted', 'quoted', 'booked', 'lost'));

-- ---------- Appointments ----------
alter table public.appointments add column if not exists assigned_by uuid references auth.users (id) on delete set null;
alter table public.appointments add column if not exists assigned_at timestamptz;

-- ---------- Assignment audit ----------
create table if not exists public.assignment_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  technician_id uuid references public.profiles (id) on delete set null,
  previous_technician_id uuid references public.profiles (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  note text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint assignment_events_entity_type_check check (entity_type in ('lead', 'appointment')),
  constraint assignment_events_action_check check (action in (
    'assign', 'reassign', 'unassign', 'claim', 'pool_on', 'pool_off', 'convert'
  ))
);

create index if not exists idx_assignment_events_entity on public.assignment_events (entity_type, entity_id, created_at desc);

alter table public.assignment_events enable row level security;

drop policy if exists assignment_events_staff_select on public.assignment_events;
create policy assignment_events_staff_select on public.assignment_events
  for select using (public.is_staff());

drop policy if exists assignment_events_staff_insert on public.assignment_events;
create policy assignment_events_staff_insert on public.assignment_events
  for insert with check (
    actor_id = auth.uid()
    and public.is_staff()
  );

-- ---------- Leads RLS (technicians: own + open pool only) ----------
drop policy if exists leads_staff_all on public.leads;

drop policy if exists leads_admin_all on public.leads;
create policy leads_admin_all on public.leads
  for all
  using (public.is_admin_level())
  with check (public.is_admin_level());

drop policy if exists leads_tech_select on public.leads;
create policy leads_tech_select on public.leads
  for select using (
    public.current_role() = 'technician'
    and (
      assigned_technician_id = auth.uid()
      or (
        in_pool is true
        and assigned_technician_id is null
        and status not in ('booked', 'lost')
      )
    )
  );

drop policy if exists leads_tech_update_claim on public.leads;
create policy leads_tech_update_claim on public.leads
  for update using (
    public.current_role() = 'technician'
    and in_pool is true
    and assigned_technician_id is null
    and status not in ('booked', 'lost')
  )
  with check (
    assigned_technician_id = auth.uid()
    and status = 'claimed'
  );

drop policy if exists leads_tech_update_own on public.leads;
create policy leads_tech_update_own on public.leads
  for update using (
    public.current_role() = 'technician'
    and assigned_technician_id = auth.uid()
  )
  with check (
    assigned_technician_id = auth.uid()
  );

-- Technicians can look up customers/vehicles for field workflow (read only).
drop policy if exists customers_tech_select on public.customers;
create policy customers_tech_select on public.customers
  for select using (public.current_role() = 'technician');

drop policy if exists vehicles_tech_select on public.vehicles;
create policy vehicles_tech_select on public.vehicles
  for select using (public.current_role() = 'technician');

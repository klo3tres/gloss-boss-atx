alter table if exists public.appointments
  add column if not exists lifecycle_stage text,
  add column if not exists lifecycle_changed_at timestamptz;

update public.appointments
set lifecycle_stage = case
    when lower(status) in ('awaiting_payment', 'pending', 'new') then 'approved'
    when lower(status) in ('deposit_paid', 'confirmed', 'assigned', 'scheduled') then 'scheduled'
    when lower(status) = 'en_route' then 'en_route'
    when lower(status) = 'in_progress' then 'in_progress'
    when lower(status) = 'quality_check' then 'quality_check'
    when lower(status) in ('payment_due', 'balance_due') then 'payment_due'
    when lower(status) = 'completed' then 'completed'
    when lower(status) in ('cancelled', 'canceled', 'deleted', 'archived') then 'cancelled'
    else 'lead'
  end,
  lifecycle_changed_at = coalesce(updated_at, created_at, now())
where lifecycle_stage is null;

alter table public.appointments drop constraint if exists appointments_lifecycle_stage_check;
alter table public.appointments add constraint appointments_lifecycle_stage_check check (
  lifecycle_stage in ('lead','estimate','approved','scheduled','en_route','in_progress','quality_check','payment_due','completed','cancelled')
) not valid;

create index if not exists idx_appointments_lifecycle_schedule
  on public.appointments(lifecycle_stage, scheduled_start);

create table if not exists public.work_order_transition_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  from_stage text not null,
  to_stage text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  reason text,
  admin_override boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_work_order_transitions_appt on public.work_order_transition_events(appointment_id, created_at desc);
alter table public.work_order_transition_events enable row level security;
drop policy if exists work_order_transitions_staff_read on public.work_order_transition_events;
create policy work_order_transitions_staff_read on public.work_order_transition_events for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('technician','admin','super_admin'))
);

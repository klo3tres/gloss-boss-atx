-- Safe additive: field invoicing, intake, payments webhook drift, customer-visible timeline/media

alter table public.appointments add column if not exists booking_source text;
alter table public.appointments add column if not exists field_invoice_paid_at timestamptz;
alter table public.appointments add column if not exists stripe_checkout_kind text;

alter table public.payments add column if not exists technician_id uuid references public.profiles (id) on delete set null;
alter table public.payments add column if not exists payment_kind text;

-- Intake: extra audit (non-destructive)
alter table public.intake_submissions add column if not exists signature_text text;
alter table public.intake_submissions add column if not exists customer_id uuid references public.customers (id) on delete set null;

-- Idempotent core tables (if 000019 skipped)
create table if not exists public.job_timeline_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  event_type text not null,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_timeline_appt_020 on public.job_timeline_events (appointment_id, created_at desc);

alter table public.job_timeline_events enable row level security;

drop policy if exists job_timeline_staff on public.job_timeline_events;
create policy job_timeline_staff on public.job_timeline_events
  for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists job_timeline_customer_read on public.job_timeline_events;
create policy job_timeline_customer_read on public.job_timeline_events
  for select
  using (
    exists (
      select 1 from public.appointments a
      inner join public.customers c on c.id = a.customer_id
      where a.id = job_timeline_events.appointment_id
        and c.auth_user_id = auth.uid()
    )
  );

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_notification_outbox_pending_020 on public.notification_outbox (status, created_at);

alter table public.notification_outbox enable row level security;

drop policy if exists notification_outbox_staff_020 on public.notification_outbox;
create policy notification_outbox_staff_020 on public.notification_outbox
  for select
  using (public.is_admin_level());

-- Ensure customer-visible flag exists for gallery policy
alter table public.job_media add column if not exists visible_to_customer boolean not null default false;

drop policy if exists job_media_customer_visible on public.job_media;
create policy job_media_customer_visible on public.job_media
  for select
  using (
    coalesce(visible_to_customer, false) = true
    and exists (
      select 1 from public.appointments a
      inner join public.customers c on c.id = a.customer_id
      where a.id = job_media.appointment_id
        and c.auth_user_id = auth.uid()
    )
  );

-- Optional linkage for field tools → assigned job timeline
alter table public.tech_job_timers add column if not exists appointment_id uuid references public.appointments (id) on delete set null;
alter table public.tech_job_notes add column if not exists appointment_id uuid references public.appointments (id) on delete set null;

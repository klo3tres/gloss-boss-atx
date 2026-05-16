alter table if exists public.tech_job_timers
  add column if not exists fallback_booking_id uuid references public.booking_fallbacks(id) on delete set null,
  add column if not exists workflow_session_id uuid references public.tech_workflow_sessions(id) on delete set null,
  add column if not exists stopped_reason text;

alter table if exists public.notification_outbox
  add column if not exists fallback_booking_id uuid references public.booking_fallbacks(id) on delete set null,
  add column if not exists technician_id uuid references public.profiles(id) on delete set null,
  add column if not exists channel text,
  add column if not exists status text default 'queued',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists sent_at timestamptz,
  add column if not exists skipped_reason text;

alter table if exists public.booking_fallbacks
  add column if not exists payment_status text,
  add column if not exists balance_due_cents integer,
  add column if not exists final_payment_url text;

alter table if exists public.appointments
  add column if not exists final_payment_url text,
  add column if not exists balance_due_cents integer,
  add column if not exists job_started_at timestamptz,
  add column if not exists job_completed_at timestamptz;

create index if not exists idx_tech_job_timers_active_tech
  on public.tech_job_timers (technician_id, started_at desc)
  where ended_at is null;

create index if not exists idx_tech_job_timers_fallback
  on public.tech_job_timers (fallback_booking_id)
  where fallback_booking_id is not null;

create index if not exists idx_notification_outbox_fallback
  on public.notification_outbox (fallback_booking_id)
  where fallback_booking_id is not null;

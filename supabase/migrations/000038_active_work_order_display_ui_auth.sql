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

alter table if exists public.messages
  add column if not exists replied_at timestamptz,
  add column if not exists reply_body text,
  add column if not exists reply_status text,
  add column if not exists archived_at timestamptz,
  add column if not exists read_at timestamptz;

alter table if exists public.appointments
  add column if not exists final_payment_url text,
  add column if not exists balance_due_cents integer,
  add column if not exists job_started_at timestamptz,
  add column if not exists job_completed_at timestamptz;

create index if not exists idx_tech_job_timers_active_display
  on public.tech_job_timers (technician_id, started_at desc)
  where ended_at is null;

create index if not exists idx_notification_outbox_status_created
  on public.notification_outbox (status, created_at desc);

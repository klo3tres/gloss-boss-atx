alter table if exists public.appointments
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists service_address text,
  add column if not exists job_started_at timestamptz,
  add column if not exists job_completed_at timestamptz;

alter table if exists public.booking_fallbacks
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists service_address text,
  add column if not exists payment_status text,
  add column if not exists balance_due_cents integer;

alter table if exists public.leads
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists service_address text;

alter table if exists public.tech_job_timers
  add column if not exists fallback_booking_id uuid references public.booking_fallbacks(id) on delete set null,
  add column if not exists workflow_session_id uuid references public.tech_workflow_sessions(id) on delete set null,
  add column if not exists status text default 'running',
  add column if not exists running boolean not null default true,
  add column if not exists stopped_reason text;

alter table if exists public.tech_job_notes
  add column if not exists internal_notes text,
  add column if not exists damage_notes text,
  add column if not exists customer_visible boolean not null default false,
  add column if not exists saved_at timestamptz;

alter table if exists public.job_media
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists approved_for_customer boolean not null default false,
  add column if not exists workflow_session_id uuid references public.tech_workflow_sessions(id) on delete set null;

alter table if exists public.job_photos
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists approved_for_customer boolean not null default false,
  add column if not exists workflow_session_id uuid references public.tech_workflow_sessions(id) on delete set null;

alter table if exists public.notification_outbox
  add column if not exists fallback_booking_id uuid references public.booking_fallbacks(id) on delete set null,
  add column if not exists technician_id uuid references public.profiles(id) on delete set null,
  add column if not exists channel text,
  add column if not exists status text default 'queued',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists sent_at timestamptz,
  add column if not exists skipped_reason text;

create index if not exists idx_appointments_tech_active_unarchived
  on public.appointments (assigned_technician_id, status, scheduled_start)
  where archived = false and deleted_at is null;

create index if not exists idx_booking_fallbacks_tech_active_unarchived
  on public.booking_fallbacks (assigned_technician_id, status, created_at)
  where archived = false and deleted_at is null;

create index if not exists idx_leads_assigned_unarchived
  on public.leads (assigned_technician_id, status, created_at)
  where archived = false and deleted_at is null;

create index if not exists idx_tech_job_timers_running_work_order
  on public.tech_job_timers (technician_id, started_at desc)
  where ended_at is null;

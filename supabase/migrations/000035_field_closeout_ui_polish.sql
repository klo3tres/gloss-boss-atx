-- Field closeout + workflow polish (safe additive only).

-- Agreement witness + SMS consent integrity
alter table public.signed_agreements add column if not exists technician_witness_id uuid references public.profiles (id) on delete set null;
alter table public.signed_agreements add column if not exists technician_witness_name text;
alter table public.signed_agreements add column if not exists technician_witness_role text;
alter table public.signed_agreements add column if not exists technician_witnessed_at timestamptz;
alter table public.signed_agreements add column if not exists sms_consent boolean not null default false;
alter table public.signed_agreements add column if not exists sms_consent_at timestamptz;
alter table public.signed_agreements add column if not exists sms_consent_text text;
alter table public.signed_agreements add column if not exists sms_consent_phone text;

alter table public.job_agreements add column if not exists technician_witness_id uuid references public.profiles (id) on delete set null;
alter table public.job_agreements add column if not exists technician_witness_name text;
alter table public.job_agreements add column if not exists technician_witness_role text;
alter table public.job_agreements add column if not exists technician_witnessed_at timestamptz;
alter table public.job_agreements add column if not exists sms_consent boolean not null default false;
alter table public.job_agreements add column if not exists sms_consent_at timestamptz;
alter table public.job_agreements add column if not exists sms_consent_text text;
alter table public.job_agreements add column if not exists sms_consent_phone text;

-- Job status / closeout / payment fields
alter table public.appointments add column if not exists job_started_at timestamptz;
alter table public.appointments add column if not exists job_completed_at timestamptz;
alter table public.appointments add column if not exists payment_status text;
alter table public.appointments add column if not exists balance_due_cents integer;
alter table public.appointments add column if not exists final_payment_checkout_session_id text;
alter table public.appointments add column if not exists final_payment_url text;
alter table public.appointments add column if not exists final_payment_created_at timestamptz;
alter table public.appointments add column if not exists no_damage_observed boolean not null default false;
alter table public.appointments add column if not exists archived_at timestamptz;
alter table public.appointments add column if not exists deleted_at timestamptz;

alter table public.tech_job_timers add column if not exists stopped_reason text;
alter table public.tech_job_timers add column if not exists duration_seconds integer;

alter table public.tech_job_notes add column if not exists no_damage_observed boolean not null default false;
alter table public.tech_job_notes add column if not exists saved_at timestamptz;

-- Photo approval / publish / archive flags
alter table public.job_media add column if not exists approved_for_customer boolean not null default false;
alter table public.job_media add column if not exists approved_at timestamptz;
alter table public.job_media add column if not exists publish_to_gallery boolean not null default false;
alter table public.job_media add column if not exists published_to_gallery boolean not null default false;
alter table public.job_media add column if not exists published_at timestamptz;
alter table public.job_media add column if not exists archived_at timestamptz;
alter table public.job_media add column if not exists deleted_at timestamptz;

alter table public.job_photos add column if not exists approved_for_customer boolean not null default false;
alter table public.job_photos add column if not exists approved_at timestamptz;
alter table public.job_photos add column if not exists publish_to_gallery boolean not null default false;
alter table public.job_photos add column if not exists published_to_gallery boolean not null default false;
alter table public.job_photos add column if not exists published_at timestamptz;
alter table public.job_photos add column if not exists archived_at timestamptz;
alter table public.job_photos add column if not exists deleted_at timestamptz;

-- Payments and notification outbox enrichment
alter table public.payments add column if not exists customer_id uuid references public.customers (id) on delete set null;
alter table public.payments add column if not exists technician_id uuid references public.profiles (id) on delete set null;
alter table public.payments add column if not exists payment_kind text;
alter table public.payments add column if not exists receipt_url text;
alter table public.payments add column if not exists balance_before_cents integer;
alter table public.payments add column if not exists balance_after_cents integer;

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.notification_outbox add column if not exists appointment_id uuid references public.appointments (id) on delete set null;
alter table public.notification_outbox add column if not exists customer_id uuid references public.customers (id) on delete set null;
alter table public.notification_outbox add column if not exists technician_id uuid references public.profiles (id) on delete set null;
alter table public.notification_outbox add column if not exists channel text;
alter table public.notification_outbox add column if not exists provider text;
alter table public.notification_outbox add column if not exists sent_at timestamptz;

create index if not exists notification_outbox_status_created_idx on public.notification_outbox (status, created_at);
create index if not exists notification_outbox_appointment_idx on public.notification_outbox (appointment_id);

-- Business/technician goals safety for dashboard cards.
create table if not exists public.business_goals (
  id uuid primary key default gen_random_uuid(),
  goal_key text not null unique,
  label text,
  target_cents integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.technician_goals (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid references public.profiles (id) on delete cascade,
  goal_key text not null,
  label text,
  target_cents integer,
  target_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Final hard ops + premium UI support.
-- Additive only: no destructive changes.

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid,
  fallback_booking_id uuid,
  payment_id uuid,
  customer_id uuid,
  receipt_number text,
  amount_cents integer not null default 0,
  payment_method text,
  status text not null default 'issued',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  channel text not null default 'sms',
  name text not null,
  subject text,
  body text not null,
  variables jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_key, channel)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  from_name text,
  from_email text,
  subject text,
  body text,
  status text default 'new',
  created_at timestamptz not null default now()
);

create table if not exists public.signed_agreements (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid,
  signer_legal_name text,
  signed_at timestamptz default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.job_agreements (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid,
  signer_legal_name text,
  signed_at timestamptz default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid,
  created_at timestamptz not null default now()
);

alter table public.appointments add column if not exists archived boolean default false;
alter table public.appointments add column if not exists archived_at timestamptz;
alter table public.appointments add column if not exists deleted_at timestamptz;
alter table public.appointments add column if not exists balance_due_cents integer default 0;
alter table public.appointments add column if not exists payment_status text;
alter table public.appointments add column if not exists booking_vehicles jsonb default '[]'::jsonb;
alter table public.appointments add column if not exists service_address text;
alter table public.appointments add column if not exists service_city text;
alter table public.appointments add column if not exists service_state text;
alter table public.appointments add column if not exists service_zip text;

alter table public.booking_fallbacks add column if not exists archived boolean default false;
alter table public.booking_fallbacks add column if not exists archived_at timestamptz;
alter table public.booking_fallbacks add column if not exists deleted_at timestamptz;
alter table public.booking_fallbacks add column if not exists balance_due_cents integer default 0;
alter table public.booking_fallbacks add column if not exists payment_status text;
alter table public.booking_fallbacks add column if not exists booking_vehicles jsonb default '[]'::jsonb;

alter table public.customers add column if not exists archived boolean default false;
alter table public.customers add column if not exists archived_at timestamptz;
alter table public.customers add column if not exists deleted_at timestamptz;

alter table public.job_media add column if not exists vehicle_index integer;
alter table public.job_media add column if not exists vehicle_label text;
alter table public.job_media add column if not exists uploaded_by uuid;
alter table public.job_media add column if not exists visible_to_customer boolean default false;

alter table public.job_photos add column if not exists vehicle_index integer;
alter table public.job_photos add column if not exists vehicle_label text;
alter table public.job_photos add column if not exists uploaded_by uuid;
alter table public.job_photos add column if not exists visible_to_customer boolean default false;

alter table public.tech_job_notes add column if not exists vehicle_index integer;
alter table public.tech_job_notes add column if not exists internal_notes text;
alter table public.tech_job_notes add column if not exists before_notes text;
alter table public.tech_job_notes add column if not exists after_notes text;
alter table public.tech_job_notes add column if not exists damage_notes text;
alter table public.tech_job_notes add column if not exists upsell_notes text;
alter table public.tech_job_notes add column if not exists customer_visible boolean default false;

alter table public.payments add column if not exists fallback_booking_id uuid;
alter table public.payments add column if not exists payment_method text;
alter table public.payments add column if not exists payment_choice text;
alter table public.payments add column if not exists paid_at timestamptz;
alter table public.payments add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.notification_outbox add column if not exists appointment_id uuid;
alter table public.notification_outbox add column if not exists fallback_booking_id uuid;
alter table public.notification_outbox add column if not exists channel text;
alter table public.notification_outbox add column if not exists status text default 'pending';
alter table public.notification_outbox add column if not exists skipped_reason text;
alter table public.notification_outbox add column if not exists payload jsonb default '{}'::jsonb;
alter table public.notification_outbox add column if not exists sent_at timestamptz;
alter table public.notification_outbox add column if not exists failed_at timestamptz;
alter table public.notification_outbox add column if not exists error_message text;

alter table public.signed_agreements add column if not exists fallback_booking_id uuid;
alter table public.signed_agreements add column if not exists archived_at timestamptz;
alter table public.signed_agreements add column if not exists deleted_at timestamptz;
alter table public.signed_agreements add column if not exists agreement_snapshot jsonb default '{}'::jsonb;

alter table public.job_agreements add column if not exists archived_at timestamptz;
alter table public.job_agreements add column if not exists deleted_at timestamptz;
alter table public.job_agreements add column if not exists agreement_snapshot jsonb default '{}'::jsonb;

alter table public.intake_submissions add column if not exists archived_at timestamptz;
alter table public.intake_submissions add column if not exists deleted_at timestamptz;

alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages add column if not exists archived_at timestamptz;
alter table public.messages add column if not exists reply_body text;
alter table public.messages add column if not exists replied_at timestamptz;

create index if not exists receipts_appointment_idx on public.receipts(appointment_id);
create index if not exists receipts_fallback_idx on public.receipts(fallback_booking_id);
create index if not exists job_media_vehicle_idx on public.job_media(appointment_id, vehicle_index);
create index if not exists job_photos_vehicle_idx on public.job_photos(appointment_id, vehicle_index);
create index if not exists tech_job_notes_vehicle_idx on public.tech_job_notes(appointment_id, vehicle_index);
create index if not exists notification_templates_key_idx on public.notification_templates(template_key, channel);

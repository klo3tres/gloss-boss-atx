-- Active work order UX, cash payments, checklist persistence, and FREE promo controls.
-- Additive/idempotent only.

alter table if exists public.site_settings
  add column if not exists accept_public_bookings boolean default true,
  add column if not exists allow_free_test_promo boolean default false;

insert into public.site_settings (key, value)
values ('allow_free_test_promo', 'false')
on conflict (key) do nothing;

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  enabled boolean not null default false,
  discount_type text not null default 'percent',
  discount_value numeric not null default 0,
  service_restrictions jsonb not null default '[]'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses int,
  used_count int not null default 0,
  archived boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.promo_codes (code, description, enabled, discount_type, discount_value, service_restrictions)
values ('FREE', 'FREE test comp for Sedan Exterior Wash only.', false, 'comp', 100, '["exterior-wash"]'::jsonb)
on conflict (code) do update set
  description = excluded.description,
  discount_type = excluded.discount_type,
  discount_value = excluded.discount_value,
  service_restrictions = excluded.service_restrictions,
  archived = false,
  archived_at = null,
  updated_at = now();

alter table if exists public.appointments
  add column if not exists payment_choice text,
  add column if not exists payment_status text,
  add column if not exists balance_due_cents int,
  add column if not exists paid_at timestamptz,
  add column if not exists final_payment_url text,
  add column if not exists checklist_completed_at timestamptz,
  add column if not exists checklist_items jsonb,
  add column if not exists notes_saved_at timestamptz,
  add column if not exists job_started_at timestamptz,
  add column if not exists job_completed_at timestamptz;

alter table if exists public.booking_fallbacks
  add column if not exists payment_choice text,
  add column if not exists payment_status text,
  add column if not exists balance_due_cents int,
  add column if not exists paid_at timestamptz,
  add column if not exists checklist_completed_at timestamptz,
  add column if not exists checklist_items jsonb,
  add column if not exists notes_saved_at timestamptz,
  add column if not exists archived boolean default false,
  add column if not exists archived_at timestamptz;

alter table if exists public.tech_workflow_sessions
  add column if not exists workflow_session_id uuid,
  add column if not exists before_photo_count int default 0,
  add column if not exists after_photo_count int default 0,
  add column if not exists last_photo_uploaded_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists checklist_completed_at timestamptz,
  add column if not exists checklist_items jsonb,
  add column if not exists notes_saved_at timestamptz;

alter table if exists public.tech_job_timers
  add column if not exists fallback_booking_id uuid,
  add column if not exists workflow_session_id uuid,
  add column if not exists status text,
  add column if not exists running boolean default true,
  add column if not exists stopped_reason text;

alter table if exists public.job_media
  add column if not exists fallback_booking_id uuid,
  add column if not exists workflow_session_id uuid,
  add column if not exists photo_category text,
  add column if not exists uploaded_by uuid,
  add column if not exists public_url text,
  add column if not exists media_url text,
  add column if not exists approved_for_customer boolean default false;

alter table if exists public.job_photos
  add column if not exists fallback_booking_id uuid,
  add column if not exists workflow_session_id uuid,
  add column if not exists photo_category text,
  add column if not exists uploaded_by uuid,
  add column if not exists public_url text,
  add column if not exists media_url text,
  add column if not exists approved_for_customer boolean default false;

alter table if exists public.tech_job_notes
  add column if not exists fallback_booking_id uuid,
  add column if not exists workflow_session_id uuid,
  add column if not exists notes text,
  add column if not exists before_notes text,
  add column if not exists after_notes text,
  add column if not exists internal_notes text,
  add column if not exists damage_notes text,
  add column if not exists upsell_suggestions text,
  add column if not exists customer_visible boolean default false;

alter table if exists public.payments
  add column if not exists payment_method text,
  add column if not exists payment_choice text,
  add column if not exists technician_id uuid,
  add column if not exists cash_received_cents int,
  add column if not exists change_given_cents int,
  add column if not exists paid_at timestamptz,
  add column if not exists receipt_url text,
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table if exists public.notification_outbox
  add column if not exists fallback_booking_id uuid,
  add column if not exists template_key text,
  add column if not exists skipped_reason text,
  add column if not exists provider_message_id text,
  add column if not exists error_message text,
  add column if not exists sent_at timestamptz;

create index if not exists idx_job_media_workflow_session on public.job_media (workflow_session_id);
create index if not exists idx_job_photos_workflow_session on public.job_photos (workflow_session_id);
create index if not exists idx_timers_workflow_session on public.tech_job_timers (workflow_session_id);
create index if not exists idx_payments_cash_method on public.payments (payment_method);

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
  enabled boolean not null default true,
  discount_type text not null default 'fixed',
  discount_value numeric not null default 0,
  service_restrictions jsonb not null default '[]'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses int,
  current_uses int not null default 0,
  archived boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.promo_codes
  add column if not exists discount_value numeric default 0;

alter table public.promo_codes
  add column if not exists discount_type text default 'fixed';

alter table public.promo_codes
  add column if not exists enabled boolean default true;

alter table public.promo_codes
  add column if not exists archived_at timestamptz;

alter table public.promo_codes
  add column if not exists service_restrictions jsonb default '[]';

alter table public.promo_codes
  add column if not exists max_uses integer;

alter table public.promo_codes
  add column if not exists current_uses integer default 0;

insert into public.promo_codes (
  code,
  description
)
values (
  'FREE',
  'Sedan Exterior Wash test promo'
)
on conflict do nothing;

do $$
declare
  service_restrictions_type text;
begin
  update public.promo_codes
  set description = 'Sedan Exterior Wash test promo'
  where code = 'FREE';

  update public.promo_codes
  set enabled = false
  where code = 'FREE'
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'promo_codes'
        and column_name = 'enabled'
    );

  update public.promo_codes
  set discount_type = 'comp'
  where code = 'FREE'
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'promo_codes'
        and column_name = 'discount_type'
    );

  update public.promo_codes
  set discount_value = 100
  where code = 'FREE'
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'promo_codes'
        and column_name = 'discount_value'
    );

  select data_type into service_restrictions_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'promo_codes'
    and column_name = 'service_restrictions';

  if service_restrictions_type = 'ARRAY' then
    update public.promo_codes
    set service_restrictions = array['exterior-wash']
    where code = 'FREE';
  elsif service_restrictions_type = 'jsonb' then
    update public.promo_codes
    set service_restrictions = '["exterior-wash"]'::jsonb
    where code = 'FREE';
  end if;

  update public.promo_codes
  set archived_at = null
  where code = 'FREE'
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'promo_codes'
        and column_name = 'archived_at'
    );
end $$;

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

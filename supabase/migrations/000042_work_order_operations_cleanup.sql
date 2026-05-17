create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  enabled boolean default false,
  discount_type text default 'percent',
  discount_value numeric default 0,
  service_restrictions text[] default '{}'::text[],
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses integer,
  used_count integer default 0,
  archived boolean default false,
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.appointments add column if not exists archived boolean default false;
alter table public.appointments add column if not exists archived_at timestamptz;
alter table public.appointments add column if not exists deleted_at timestamptz;
alter table public.appointments add column if not exists booking_pricing_breakdown jsonb default '{}'::jsonb;
alter table public.appointments add column if not exists promo_code text;
alter table public.appointments add column if not exists comp_reason text;
alter table public.appointments add column if not exists balance_due_cents integer;
alter table public.appointments add column if not exists work_order_status text;

alter table public.booking_fallbacks add column if not exists archived boolean default false;
alter table public.booking_fallbacks add column if not exists archived_at timestamptz;
alter table public.booking_fallbacks add column if not exists deleted_at timestamptz;
alter table public.booking_fallbacks add column if not exists booking_vehicles jsonb default '[]'::jsonb;
alter table public.booking_fallbacks add column if not exists booking_pricing_breakdown jsonb default '{}'::jsonb;
alter table public.booking_fallbacks add column if not exists promo_code text;
alter table public.booking_fallbacks add column if not exists comp_reason text;
alter table public.booking_fallbacks add column if not exists balance_due_cents integer;
alter table public.booking_fallbacks add column if not exists work_order_status text;

alter table public.work_orders add column if not exists archived boolean default false;
alter table public.work_orders add column if not exists archived_at timestamptz;
alter table public.work_orders add column if not exists deleted_at timestamptz;
alter table public.work_orders add column if not exists agreement_id uuid;
alter table public.work_orders add column if not exists intake_submission_id uuid;
alter table public.work_orders add column if not exists payment_id uuid;
alter table public.work_orders add column if not exists promo_code text;
alter table public.work_orders add column if not exists booking_pricing_breakdown jsonb default '{}'::jsonb;

alter table public.leads add column if not exists archived boolean default false;
alter table public.leads add column if not exists archived_at timestamptz;
alter table public.leads add column if not exists deleted_at timestamptz;

alter table public.signed_agreements add column if not exists fallback_booking_id uuid;
alter table public.signed_agreements add column if not exists customer_id uuid;
alter table public.signed_agreements add column if not exists payment_id uuid;
alter table public.signed_agreements add column if not exists work_order_id uuid;
alter table public.signed_agreements add column if not exists vehicle_data jsonb default '[]'::jsonb;
alter table public.signed_agreements add column if not exists service_address text;

alter table public.intake_submissions add column if not exists fallback_booking_id uuid;
alter table public.intake_submissions add column if not exists payment_id uuid;
alter table public.intake_submissions add column if not exists work_order_id uuid;
alter table public.intake_submissions add column if not exists vehicle_data jsonb default '[]'::jsonb;
alter table public.intake_submissions add column if not exists service_address text;

alter table public.customers add column if not exists service_address text;
alter table public.customers add column if not exists service_city text;
alter table public.customers add column if not exists service_state text;
alter table public.customers add column if not exists service_zip text;

alter table public.tech_job_timers add column if not exists work_order_id uuid;
alter table public.tech_job_timers add column if not exists fallback_booking_id uuid;
alter table public.tech_job_timers add column if not exists workflow_session_id uuid;

alter table public.notification_outbox add column if not exists work_order_id uuid;
alter table public.notification_outbox add column if not exists appointment_id uuid;
alter table public.notification_outbox add column if not exists fallback_booking_id uuid;
alter table public.notification_outbox add column if not exists customer_id uuid;

create index if not exists idx_promo_codes_code on public.promo_codes(code);
create index if not exists idx_promo_codes_enabled on public.promo_codes(enabled);
create index if not exists idx_leads_archived on public.leads(archived, archived_at);
create index if not exists idx_appointments_archive_status on public.appointments(archived, deleted_at, status);
create index if not exists idx_booking_fallbacks_archive_status on public.booking_fallbacks(archived, deleted_at, status);

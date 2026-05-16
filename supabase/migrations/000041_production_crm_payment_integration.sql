create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid,
  fallback_booking_id uuid,
  customer_id uuid,
  assigned_technician_id uuid,
  status text default 'open',
  payment_status text,
  agreement_status text,
  service_address text,
  service_city text,
  service_state text,
  service_zip text,
  vehicle_summary text,
  vehicle_data jsonb default '[]'::jsonb,
  service_summary text,
  archived boolean default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.appointments add column if not exists booking_vehicles jsonb default '[]'::jsonb;
alter table public.appointments add column if not exists payment_status text;
alter table public.appointments add column if not exists promo_code text;
alter table public.appointments add column if not exists comp_reason text;
alter table public.appointments add column if not exists archived boolean default false;
alter table public.appointments add column if not exists archived_at timestamptz;
alter table public.appointments add column if not exists deleted_at timestamptz;

alter table public.booking_fallbacks add column if not exists booking_vehicles jsonb default '[]'::jsonb;
alter table public.booking_fallbacks add column if not exists service_address text;
alter table public.booking_fallbacks add column if not exists service_city text;
alter table public.booking_fallbacks add column if not exists service_state text;
alter table public.booking_fallbacks add column if not exists service_zip text;
alter table public.booking_fallbacks add column if not exists service_address_notes text;
alter table public.booking_fallbacks add column if not exists payment_status text;
alter table public.booking_fallbacks add column if not exists promo_code text;
alter table public.booking_fallbacks add column if not exists comp_reason text;
alter table public.booking_fallbacks add column if not exists archived boolean default false;
alter table public.booking_fallbacks add column if not exists archived_at timestamptz;
alter table public.booking_fallbacks add column if not exists deleted_at timestamptz;

alter table public.customers add column if not exists service_address text;
alter table public.customers add column if not exists service_city text;
alter table public.customers add column if not exists service_state text;
alter table public.customers add column if not exists service_zip text;

alter table public.payments add column if not exists customer_id uuid;
alter table public.payments add column if not exists fallback_booking_id uuid;
alter table public.payments add column if not exists stripe_checkout_session_id text;
alter table public.payments add column if not exists stripe_payment_intent_id text;
alter table public.payments add column if not exists payment_kind text;
alter table public.payments add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.payment_refunds add column if not exists customer_id uuid;
alter table public.payment_refunds add column if not exists appointment_id uuid;
alter table public.payment_refunds add column if not exists fallback_booking_id uuid;

alter table public.signed_agreements add column if not exists customer_id uuid;
alter table public.signed_agreements add column if not exists fallback_booking_id uuid;
alter table public.signed_agreements add column if not exists payment_id uuid;
alter table public.signed_agreements add column if not exists vehicle_data jsonb default '[]'::jsonb;
alter table public.signed_agreements add column if not exists service_address text;

alter table public.intake_submissions add column if not exists fallback_booking_id uuid;
alter table public.intake_submissions add column if not exists payment_id uuid;
alter table public.intake_submissions add column if not exists vehicle_data jsonb default '[]'::jsonb;
alter table public.intake_submissions add column if not exists service_address text;

alter table public.notification_outbox add column if not exists appointment_id uuid;
alter table public.notification_outbox add column if not exists fallback_booking_id uuid;
alter table public.notification_outbox add column if not exists customer_id uuid;
alter table public.notification_outbox add column if not exists channel text;
alter table public.notification_outbox add column if not exists status text;
alter table public.notification_outbox add column if not exists skipped_reason text;

alter table public.site_settings add column if not exists accept_public_bookings boolean default true;
alter table public.site_settings add column if not exists allow_free_test_promo boolean default false;

create index if not exists idx_work_orders_appointment on public.work_orders(appointment_id);
create index if not exists idx_work_orders_customer on public.work_orders(customer_id);
create index if not exists idx_work_orders_status on public.work_orders(status);
create index if not exists idx_appointments_customer_id on public.appointments(customer_id);
create index if not exists idx_appointments_guest_email on public.appointments(guest_email);
create index if not exists idx_appointments_guest_phone on public.appointments(guest_phone);
create index if not exists idx_appointments_payment_status on public.appointments(payment_status);
create index if not exists idx_payments_customer_id on public.payments(customer_id);
create index if not exists idx_payments_appointment_id on public.payments(appointment_id);
create index if not exists idx_payments_checkout_session on public.payments(stripe_checkout_session_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete set null,
  fallback_booking_id uuid references public.booking_fallbacks(id) on delete set null,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  amount_cents integer,
  status text,
  payment_kind text,
  technician_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table if exists public.payments
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists fallback_booking_id uuid references public.booking_fallbacks(id) on delete set null,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists amount_cents integer,
  add column if not exists status text,
  add column if not exists payment_kind text,
  add column if not exists technician_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  stripe_refund_id text unique,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  amount_cents integer,
  status text,
  actor_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  action text not null,
  status text,
  actor_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.appointments
  add column if not exists service_address text,
  add column if not exists service_city text,
  add column if not exists service_state text,
  add column if not exists service_zip text,
  add column if not exists service_address_notes text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists payment_status text,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists final_payment_url text,
  add column if not exists balance_due_cents integer;

alter table if exists public.booking_fallbacks
  add column if not exists service_address text,
  add column if not exists service_city text,
  add column if not exists service_state text,
  add column if not exists service_zip text,
  add column if not exists service_address_notes text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists payment_status text,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists balance_due_cents integer;

alter table if exists public.customers
  add column if not exists service_address text,
  add column if not exists service_city text,
  add column if not exists service_state text,
  add column if not exists service_zip text;

alter table if exists public.site_settings
  add column if not exists accept_public_bookings boolean not null default true;

create unique index if not exists idx_payments_checkout_session_unique
  on public.payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists idx_payments_payment_intent
  on public.payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists idx_payments_created
  on public.payments (created_at desc);

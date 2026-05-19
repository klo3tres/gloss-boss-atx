-- Final product completion support.
-- Additive only. No destructive changes.

create table if not exists public.integration_test_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  status text not null default 'skipped',
  destination text,
  error_message text,
  actor_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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

alter table public.receipts add column if not exists emailed_to text;
alter table public.receipts add column if not exists email_status text;
alter table public.receipts add column if not exists emailed_at timestamptz;
alter table public.receipts add column if not exists last_error text;
alter table public.receipts add column if not exists base_total_cents integer;
alter table public.receipts add column if not exists final_total_cents integer;
alter table public.receipts add column if not exists remaining_balance_cents integer;
alter table public.receipts add column if not exists discount_total_cents integer default 0;
alter table public.receipts add column if not exists service_address text;
alter table public.receipts add column if not exists vehicle_snapshot jsonb default '[]'::jsonb;
alter table public.receipts add column if not exists pricing_snapshot jsonb default '{}'::jsonb;

alter table public.payments add column if not exists receipt_id uuid;
alter table public.payments add column if not exists payment_method text;
alter table public.payments add column if not exists payment_choice text;
alter table public.payments add column if not exists paid_at timestamptz;
alter table public.payments add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.notification_outbox add column if not exists error_message text;
alter table public.notification_outbox add column if not exists sent_at timestamptz;
alter table public.notification_outbox add column if not exists failed_at timestamptz;

alter table public.messages add column if not exists reply_body text;
alter table public.messages add column if not exists draft_body text;
alter table public.messages add column if not exists thread_id uuid;
alter table public.messages add column if not exists archived_at timestamptz;
alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages add column if not exists replied_at timestamptz;

alter table public.appointments add column if not exists deleted_at timestamptz;
alter table public.appointments add column if not exists archived_at timestamptz;
alter table public.appointments add column if not exists archived boolean default false;
alter table public.booking_fallbacks add column if not exists deleted_at timestamptz;
alter table public.booking_fallbacks add column if not exists archived_at timestamptz;
alter table public.booking_fallbacks add column if not exists archived boolean default false;

alter table public.signed_agreements add column if not exists fallback_booking_id uuid;
alter table public.signed_agreements add column if not exists agreement_snapshot jsonb default '{}'::jsonb;
alter table public.intake_submissions add column if not exists fallback_booking_id uuid;

create index if not exists receipts_payment_idx on public.receipts(payment_id);
create index if not exists receipts_customer_idx on public.receipts(customer_id);
create index if not exists receipts_created_idx on public.receipts(created_at desc);
create index if not exists integration_test_events_kind_idx on public.integration_test_events(kind, created_at desc);

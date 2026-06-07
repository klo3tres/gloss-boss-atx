-- Business system completion: SMS consent, revenue hygiene, Stripe ledger, expenses,
-- memberships/loyalty, reports, and gallery publishing support.

alter table public.customers add column if not exists sms_consent boolean not null default false;
alter table public.customers add column if not exists sms_consent_source text;
alter table public.customers add column if not exists sms_consent_timestamp timestamptz;
alter table public.customers add column if not exists sms_consent_ip text;
alter table public.customers add column if not exists sms_consent_user_agent text;
alter table public.customers add column if not exists sms_opt_out_timestamp timestamptz;
alter table public.customers add column if not exists sms_status text not null default 'opted_out';
alter table public.customers add column if not exists membership_discount_percent integer not null default 0;

alter table public.appointments add column if not exists sms_consent boolean not null default false;
alter table public.appointments add column if not exists sms_consent_source text;
alter table public.appointments add column if not exists sms_consent_timestamp timestamptz;
alter table public.appointments add column if not exists sms_consent_ip text;
alter table public.appointments add column if not exists sms_consent_user_agent text;
alter table public.appointments add column if not exists sms_consent_text text;
alter table public.appointments add column if not exists sms_opt_out_timestamp timestamptz;
alter table public.appointments add column if not exists sms_status text not null default 'opted_out';
alter table public.appointments add column if not exists is_test boolean not null default false;
alter table public.appointments add column if not exists exclude_from_revenue boolean not null default false;
alter table public.appointments add column if not exists total_amount integer;
alter table public.appointments add column if not exists amount_paid integer;
alter table public.appointments add column if not exists completed_at timestamptz;

alter table public.payments add column if not exists provider text;
alter table public.payments add column if not exists provider_payment_id text;
alter table public.payments add column if not exists amount integer;
alter table public.payments add column if not exists refunded_at timestamptz;
alter table public.payments add column if not exists is_test boolean not null default false;
alter table public.payments add column if not exists exclude_from_revenue boolean not null default false;
alter table public.payments add column if not exists stripe_charge_id text;
alter table public.payments add column if not exists stripe_balance_transaction_id text;
alter table public.payments add column if not exists refunded_amount_cents integer not null default 0;
alter table public.payments add column if not exists fee_amount_cents integer not null default 0;
alter table public.payments add column if not exists net_amount_cents integer;

alter table public.receipts add column if not exists is_test boolean not null default false;
alter table public.receipts add column if not exists exclude_from_revenue boolean not null default false;
alter table public.receipts add column if not exists voided_at timestamptz;
alter table public.receipts add column if not exists void_reason text;
alter table public.receipts add column if not exists refunded_at timestamptz;

create table if not exists public.sms_consent_audit_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  appointment_id uuid,
  fallback_booking_id uuid,
  changed_by uuid,
  source text not null,
  previous_sms_consent boolean,
  new_sms_consent boolean not null,
  sms_status text not null,
  ip_address text,
  user_agent text,
  consent_text text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sms_consent_audit_customer on public.sms_consent_audit_log (customer_id, created_at desc);
create index if not exists idx_sms_consent_audit_appointment on public.sms_consent_audit_log (appointment_id, created_at desc);

create table if not exists public.financial_ledger (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual',
  type text not null,
  amount integer not null default 0,
  gross_amount integer not null default 0,
  fee_amount integer not null default 0,
  net_amount integer not null default 0,
  description text,
  category text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_balance_transaction_id text,
  stripe_payout_id text,
  stripe_issuing_transaction_id text,
  work_order_id uuid,
  receipt_id uuid,
  payment_id uuid,
  is_test boolean not null default false,
  exclude_from_reports boolean not null default false,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.financial_ledger add column if not exists stripe_balance_transaction_id text;
alter table public.financial_ledger add column if not exists stripe_issuing_transaction_id text;
alter table public.financial_ledger add column if not exists type text;
alter table public.financial_ledger add column if not exists occurred_at timestamptz not null default now();
alter table public.financial_ledger add column if not exists exclude_from_reports boolean not null default false;
alter table public.financial_ledger add column if not exists is_test boolean not null default false;

create unique index if not exists idx_financial_ledger_balance_tx on public.financial_ledger (stripe_balance_transaction_id) where stripe_balance_transaction_id is not null;
create unique index if not exists idx_financial_ledger_issuing_tx on public.financial_ledger (stripe_issuing_transaction_id) where stripe_issuing_transaction_id is not null;
create index if not exists idx_financial_ledger_type_date on public.financial_ledger (type, occurred_at desc);
create index if not exists idx_financial_ledger_reports on public.financial_ledger (exclude_from_reports, is_test, occurred_at desc);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  category text not null default 'other',
  amount_cents integer not null default 0,
  payment_method text not null default 'other',
  work_order_id uuid,
  receipt_url text,
  notes text,
  is_test boolean not null default false,
  exclude_from_reports boolean not null default false,
  occurred_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_expenses_date on public.expenses (occurred_at desc);
create index if not exists idx_expenses_reports on public.expenses (exclude_from_reports, is_test, occurred_at desc);

create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  tier text not null,
  price_cents integer not null default 0,
  billing_interval text not null default 'month',
  benefits jsonb not null default '[]'::jsonb,
  included_services jsonb not null default '[]'::jsonb,
  discount_percent integer not null default 0,
  reward_rules jsonb not null default '{}'::jsonb,
  show_on_homepage boolean not null default true,
  show_on_services boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_memberships (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  membership_plan_id uuid not null references public.membership_plans (id) on delete restrict,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  assigned_by uuid,
  stripe_checkout_session_id text,
  stripe_subscription_id text,
  stripe_payment_intent_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_memberships add column if not exists stripe_checkout_session_id text;
alter table public.customer_memberships add column if not exists stripe_subscription_id text;
alter table public.customer_memberships add column if not exists stripe_payment_intent_id text;

create unique index if not exists idx_customer_memberships_checkout on public.customer_memberships (stripe_checkout_session_id) where stripe_checkout_session_id is not null;

create table if not exists public.loyalty_stamps (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  appointment_id uuid,
  membership_plan_id uuid,
  stamp_count integer not null default 1,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_loyalty_stamps_customer on public.loyalty_stamps (customer_id, created_at desc);

create table if not exists public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid,
  customer_id uuid,
  customer_email text,
  customer_name text,
  service_label text,
  rating integer not null default 5,
  testimonial text not null,
  published boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_reviews_created on public.customer_reviews (created_at desc);
create index if not exists idx_customer_reviews_published on public.customer_reviews (published, created_at desc);

create table if not exists public.loyalty_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rule_type text not null default 'punch_card',
  services_required integer not null default 5,
  reward_description text not null default '6th wash/free reward',
  reward_payload jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.membership_plans (name, slug, tier, price_cents, billing_interval, benefits)
values
  ('Bronze', 'bronze', 'bronze', 0, 'month', '["Member pricing", "Priority booking"]'::jsonb),
  ('Silver', 'silver', 'silver', 0, 'month', '["Member pricing", "Priority booking", "Loyalty boosts"]'::jsonb),
  ('Gold', 'gold', 'gold', 0, 'month', '["Premium member pricing", "Priority booking", "Reward services"]'::jsonb)
on conflict (slug) do nothing;

insert into public.loyalty_rules (name, services_required, reward_description)
values ('Default punch card', 5, 'Complete 5 services, unlock 6th wash/free reward.')
on conflict do nothing;

alter table if exists public.gallery_items add column if not exists appointment_id uuid;
alter table if exists public.gallery_items add column if not exists before_photo_url text;
alter table if exists public.gallery_items add column if not exists after_photo_url text;
alter table if exists public.gallery_items add column if not exists vehicle text;
alter table if exists public.gallery_items add column if not exists service_type text;
alter table if exists public.gallery_items add column if not exists published boolean not null default true;
alter table if exists public.gallery_items add column if not exists featured boolean not null default false;

alter table if exists public.gallery_images add column if not exists appointment_id uuid;
alter table if exists public.gallery_images add column if not exists before_photo_url text;
alter table if exists public.gallery_images add column if not exists after_photo_url text;
alter table if exists public.gallery_images add column if not exists vehicle_type text;
alter table if exists public.gallery_images add column if not exists service_category text;
alter table if exists public.gallery_images add column if not exists destination text;
alter table if exists public.gallery_images add column if not exists tags text[] not null default '{}'::text[];

alter table public.notification_outbox add column if not exists consent_checked boolean not null default false;
alter table public.notification_outbox add column if not exists consent_result text;

alter table if exists public.financial_ledger add column if not exists stripe_issuing_transaction_id text;

create unique index if not exists idx_financial_ledger_issuing_tx
  on public.financial_ledger (stripe_issuing_transaction_id)
  where stripe_issuing_transaction_id is not null;

alter table if exists public.customers add column if not exists membership_discount_percent integer not null default 0;
alter table if exists public.customer_memberships add column if not exists stripe_checkout_session_id text;
alter table if exists public.customer_memberships add column if not exists stripe_subscription_id text;
alter table if exists public.customer_memberships add column if not exists stripe_payment_intent_id text;

create unique index if not exists idx_customer_memberships_checkout
  on public.customer_memberships (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

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

alter table if exists public.gallery_images add column if not exists appointment_id uuid;
alter table if exists public.gallery_images add column if not exists before_photo_url text;
alter table if exists public.gallery_images add column if not exists after_photo_url text;
alter table if exists public.gallery_images add column if not exists vehicle_type text;
alter table if exists public.gallery_images add column if not exists service_category text;
alter table if exists public.gallery_images add column if not exists destination text;
alter table if exists public.gallery_images add column if not exists tags text[] not null default '{}'::text[];

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

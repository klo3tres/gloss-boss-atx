-- Automation hardening for Stripe webhooks, memberships, receipts, and credits.
-- Additive only: no table drops, no cascades, no destructive data changes.

alter table if exists public.customers
  add column if not exists stripe_customer_id text;

alter table if exists public.customer_memberships
  add column if not exists stripe_customer_id text,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists canceled_at timestamptz,
  add column if not exists membership_credit_cents integer not null default 0,
  add column if not exists quarterly_credit_cents integer not null default 0,
  add column if not exists annual_credit_cents integer not null default 0,
  add column if not exists credit_balance_cents integer not null default 0,
  add column if not exists last_credit_refresh_at timestamptz;

alter table if exists public.membership_plans
  add column if not exists membership_credit_cents integer not null default 0,
  add column if not exists quarterly_credit_cents integer not null default 0,
  add column if not exists annual_credit_cents integer not null default 0;

update public.membership_plans
set quarterly_credit_cents = case
    when lower(coalesce(slug, tier, name, '')) = 'silver' then 2500
    when lower(coalesce(slug, tier, name, '')) = 'gold' then 5000
    else quarterly_credit_cents
  end,
  annual_credit_cents = case
    when lower(coalesce(slug, tier, name, '')) = 'gold' then 7500
    else annual_credit_cents
  end,
  membership_credit_cents = greatest(membership_credit_cents, quarterly_credit_cents, annual_credit_cents)
where lower(coalesce(slug, tier, name, '')) in ('bronze', 'silver', 'gold');

alter table if exists public.payments
  add column if not exists stripe_charge_id text,
  add column if not exists fallback_booking_id uuid,
  add column if not exists customer_id uuid,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_kind text,
  add column if not exists provider text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists exclude_from_revenue boolean not null default false,
  add column if not exists is_test boolean not null default false,
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_amount_cents integer not null default 0;

alter table if exists public.receipts
  add column if not exists fallback_booking_id uuid,
  add column if not exists customer_id uuid,
  add column if not exists payment_id uuid,
  add column if not exists paid_at timestamptz,
  add column if not exists status text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists exclude_from_revenue boolean not null default false,
  add column if not exists is_test boolean not null default false;

create index if not exists idx_customers_stripe_customer_id
  on public.customers (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists idx_customer_memberships_stripe_customer_id
  on public.customer_memberships (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists idx_payments_stripe_charge_id
  on public.payments (stripe_charge_id)
  where stripe_charge_id is not null;

create index if not exists idx_receipts_payment_id
  on public.receipts (payment_id)
  where payment_id is not null;

create table if not exists public.membership_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  customer_membership_id uuid references public.customer_memberships(id) on delete set null,
  membership_plan_id uuid references public.membership_plans(id) on delete set null,
  amount_cents integer not null default 0,
  balance_after_cents integer not null default 0,
  reason text not null default 'membership_credit',
  stripe_invoice_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

alter table public.membership_credit_ledger enable row level security;

drop policy if exists "Admin read membership_credit_ledger" on public.membership_credit_ledger;
create policy "Admin read membership_credit_ledger"
  on public.membership_credit_ledger for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('admin', 'super_admin')
    )
  );

drop policy if exists "Admin write membership_credit_ledger" on public.membership_credit_ledger;
create policy "Admin write membership_credit_ledger"
  on public.membership_credit_ledger for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('admin', 'super_admin')
    )
  );

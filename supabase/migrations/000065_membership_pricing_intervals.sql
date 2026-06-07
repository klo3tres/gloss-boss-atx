-- Migration 000065: Add multiple billing interval pricing to membership plans
-- Alters public.membership_plans and public.customer_memberships, then updates the plans.

alter table public.membership_plans
add column if not exists price_weekly_cents integer not null default 0,
add column if not exists price_biweekly_cents integer not null default 0,
add column if not exists price_monthly_cents integer not null default 0,
add column if not exists price_yearly_cents integer not null default 0;

alter table public.customer_memberships
add column if not exists billing_interval text not null default 'month',
add column if not exists price_cents integer not null default 0;

-- Bronze plan updates
update public.membership_plans
set 
  price_weekly_cents = 4500,
  price_biweekly_cents = 7900,
  price_monthly_cents = 14900,
  price_yearly_cents = 149000,
  price_cents = 14900,
  benefits = '["Member pricing on all detail packages", "Priority scheduling windows", "Bi-weekly wash schedule", "24/7 client booking access"]'::jsonb
where slug = 'bronze';

-- Silver plan updates
update public.membership_plans
set 
  price_weekly_cents = 6900,
  price_biweekly_cents = 12900,
  price_monthly_cents = 24900,
  price_yearly_cents = 249000,
  price_cents = 24900,
  benefits = '["All Bronze package benefits", "Loyalty stamp multiplier (2x boost)", "Full exterior clay-bar treatment included", "Interior leather conditioning", "Dedicated direct detailing support line"]'::jsonb
where slug = 'silver';

-- Gold plan updates
update public.membership_plans
set 
  price_weekly_cents = 10900,
  price_biweekly_cents = 20900,
  price_monthly_cents = 39900,
  price_yearly_cents = 399000,
  price_cents = 39900,
  benefits = '["All Silver package benefits", "Complimentary ceramic coating booster", "Bi-weekly luxury interior/exterior detailing", "Free engine bay cleaning addon", "No rescheduling or cancellation fees"]'::jsonb
where slug = 'gold';

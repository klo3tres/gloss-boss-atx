-- Official Gloss Boss ATX public memberships.
-- Keeps duplicate historical rows for audit, but ensures the canonical slugs are correct.

alter table if exists public.membership_plans
  add column if not exists price_weekly_cents integer not null default 0,
  add column if not exists price_biweekly_cents integer not null default 0,
  add column if not exists price_monthly_cents integer not null default 0,
  add column if not exists price_yearly_cents integer not null default 0,
  add column if not exists punch_multiplier numeric default 1.0,
  add column if not exists bonus_punches integer default 0,
  add column if not exists reward_threshold integer default 5,
  add column if not exists reward_description text default 'Complete 5 services, unlock 6th reward.';

insert into public.membership_plans (
  name,
  slug,
  tier,
  price_cents,
  price_monthly_cents,
  price_yearly_cents,
  billing_interval,
  benefits,
  included_services,
  discount_percent,
  punch_multiplier,
  bonus_punches,
  reward_threshold,
  reward_description,
  show_on_homepage,
  show_on_services,
  archived,
  updated_at
) values
  (
    'Bronze',
    'bronze',
    'bronze',
    2400,
    2400,
    24900,
    'monthly',
    '["10% off services", "Priority scheduling", "Member promotions"]'::jsonb,
    '["Digital punch card", "Member-only booking reminders", "Priority scheduling access"]'::jsonb,
    10,
    1.0,
    0,
    5,
    'Complete 5 paid services, unlock the 6th reward from the Bronze menu.',
    true,
    true,
    false,
    now()
  ),
  (
    'Silver',
    'silver',
    'silver',
    4900,
    4900,
    49900,
    'monthly',
    '["15% off services", "Priority scheduling", "Quarterly upgrade credit", "Member promotions"]'::jsonb,
    '["Digital punch card", "Quarterly upgrade credit", "Priority scheduling access", "Silver reward menu"]'::jsonb,
    15,
    1.25,
    0,
    5,
    'Complete 5 paid services, unlock the 6th reward from the Silver menu.',
    true,
    true,
    false,
    now()
  ),
  (
    'Gold',
    'gold',
    'gold',
    7900,
    7900,
    79900,
    'monthly',
    '["20% off services", "Front of line scheduling", "Annual $75 credit", "Upgrade credit every 60 days", "VIP promotions"]'::jsonb,
    '["Digital punch card", "Annual $75 credit", "Upgrade credit every 60 days", "Gold reward menu", "Front of line scheduling"]'::jsonb,
    20,
    1.5,
    0,
    5,
    'Complete 5 paid services, unlock the 6th VIP reward from the Gold menu.',
    true,
    true,
    false,
    now()
  )
on conflict (slug) do update set
  name = excluded.name,
  tier = excluded.tier,
  price_cents = excluded.price_cents,
  price_monthly_cents = excluded.price_monthly_cents,
  price_yearly_cents = excluded.price_yearly_cents,
  billing_interval = excluded.billing_interval,
  benefits = excluded.benefits,
  included_services = excluded.included_services,
  discount_percent = excluded.discount_percent,
  punch_multiplier = excluded.punch_multiplier,
  bonus_punches = excluded.bonus_punches,
  reward_threshold = excluded.reward_threshold,
  reward_description = excluded.reward_description,
  show_on_homepage = excluded.show_on_homepage,
  show_on_services = excluded.show_on_services,
  archived = excluded.archived,
  updated_at = now();

update public.membership_plans
set archived = true, show_on_homepage = false, show_on_services = false, updated_at = now()
where lower(coalesce(slug, '')) not in ('bronze', 'silver', 'gold')
  and lower(coalesce(tier, '')) not in ('bronze', 'silver', 'gold');

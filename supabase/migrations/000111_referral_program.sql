-- Referral program foundation
create table if not exists public.customer_referral_codes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  unique (customer_id),
  unique (code)
);

create index if not exists idx_customer_referral_codes_code on public.customer_referral_codes (lower(code));

create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  referrer_customer_id uuid references public.customers(id) on delete set null,
  referral_code text not null,
  referred_email text,
  referred_customer_id uuid references public.customers(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  status text not null default 'clicked' check (
    status in ('clicked', 'signed_up', 'booked', 'completed', 'reward_issued', 'expired')
  ),
  referrer_reward_cents integer not null default 0,
  referred_reward_cents integer not null default 0,
  reward_issued_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_referral_events_referrer on public.referral_events (referrer_customer_id, created_at desc);
create index if not exists idx_referral_events_code on public.referral_events (lower(referral_code));

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  referral_event_id uuid references public.referral_events(id) on delete set null,
  reward_type text not null check (reward_type in ('percent', 'dollar', 'free_service', 'custom')),
  reward_value numeric not null default 0,
  reward_label text,
  status text not null default 'pending' check (status in ('pending', 'issued', 'redeemed', 'expired')),
  issued_at timestamptz,
  redeemed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_referral_rewards_customer on public.referral_rewards (customer_id, created_at desc);

insert into public.site_settings (key, value)
values (
  'referral_program',
  '{
    "enabled": true,
    "referrerRewardType": "percent",
    "referrerRewardValue": 15,
    "referredRewardType": "percent",
    "referredRewardValue": 10,
    "minCompletedBookings": 1,
    "maxRewardsPerCustomer": 10,
    "stackingAllowed": false,
    "reviewRewardEnabled": true,
    "reviewRewardType": "percent",
    "reviewRewardValue": 10,
    "freeDetailReferralThreshold": 5,
    "freeDetailServiceSlug": "full-detail"
  }'::jsonb
)
on conflict (key) do nothing;

alter table public.customer_reviews add column if not exists updated_at timestamptz default now();

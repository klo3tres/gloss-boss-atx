-- Durable, exactly-once referral reward issuance and expanded lifecycle statuses.

alter table public.referral_events drop constraint if exists referral_events_status_check;
alter table public.referral_events add constraint referral_events_status_check check (
  status in ('shared', 'clicked', 'signed_up', 'booked', 'pending_completion', 'completed', 'reward_issued', 'reward_available', 'redeemed', 'expired', 'voided')
);

alter table public.referral_rewards drop constraint if exists referral_rewards_status_check;
alter table public.referral_rewards add constraint referral_rewards_status_check check (
  status in ('pending', 'issued', 'available', 'redeemed', 'expired', 'voided')
);

alter table public.referral_rewards drop constraint if exists referral_rewards_reward_type_check;
alter table public.referral_rewards add constraint referral_rewards_reward_type_check check (
  reward_type in ('percent', 'dollar', 'free_addon', 'free_service', 'membership_credit', 'custom')
);

alter table public.referral_rewards
  add column if not exists selected_service_slug text,
  add column if not exists reserved_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists customer_credit_id uuid references public.customer_credits(id) on delete set null;

create unique index if not exists referral_rewards_one_per_appointment_idx
  on public.referral_rewards ((metadata->>'appointment_id'))
  where metadata ? 'appointment_id';

create unique index if not exists customer_credits_unique_source_idx
  on public.customer_credits (source)
  where source like 'referral:%' or source like 'loyalty:%';

create index if not exists referral_rewards_wallet_idx
  on public.referral_rewards (customer_id, status, created_at desc);

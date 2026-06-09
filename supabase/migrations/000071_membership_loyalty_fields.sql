-- Add loyalty rule columns to membership_plans to connect memberships and loyalty rules config
alter table if exists public.membership_plans
  add column if not exists punch_multiplier numeric default 1.0,
  add column if not exists bonus_punches integer default 0,
  add column if not exists reward_threshold integer default 5,
  add column if not exists reward_description text default 'Complete 5 services, unlock 6th wash/free reward.';

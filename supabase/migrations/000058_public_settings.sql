-- Optional app settings (Stripe keys, feature flags) — silences build warnings when missing.

create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

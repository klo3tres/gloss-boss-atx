-- Booking resilience: additive columns / tables only (no destructive DDL).
-- Core flow uses guest_* , base_price_cents, deposit_amount_cents, scheduled_start (existing).

-- ---------- appointments: optional mirror / reporting fields ----------
alter table public.appointments add column if not exists customer_name text;
alter table public.appointments add column if not exists customer_email text;
alter table public.appointments add column if not exists customer_phone text;

alter table public.appointments add column if not exists scheduled_at timestamptz;

alter table public.appointments add column if not exists vehicle_summary text;

alter table public.appointments add column if not exists total_cents integer;
alter table public.appointments add column if not exists deposit_cents integer;

alter table public.appointments add column if not exists stripe_session_id text;

-- Stripe PI on the row (also stored on payments in many setups)
alter table public.appointments add column if not exists stripe_payment_intent_id text;

-- Structured per-booking payloads (older DBs may lack these)
alter table public.appointments add column if not exists booking_vehicles jsonb not null default '[]'::jsonb;
alter table public.appointments add column if not exists booking_add_ons jsonb not null default '[]'::jsonb;

-- ---------- payments: ensure table exists (matches 000001 shape) ----------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount_cents int not null,
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  created_at timestamptz not null default now()
);

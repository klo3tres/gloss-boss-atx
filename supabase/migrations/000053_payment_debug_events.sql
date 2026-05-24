-- Payment checkout diagnostics for production support (Stripe failures, pay-later, etc.)

create table if not exists public.payment_debug_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  appointment_id uuid references public.appointments(id) on delete set null,
  fallback_booking_id uuid references public.booking_fallbacks(id) on delete set null,
  customer_email text,
  event_type text not null,
  payment_mode text,
  stripe_mode text,
  error_code text,
  error_message text,
  metadata jsonb default '{}'::jsonb
);

create index if not exists idx_payment_debug_events_created on public.payment_debug_events(created_at desc);
create index if not exists idx_payment_debug_events_appointment on public.payment_debug_events(appointment_id);

alter table public.payment_debug_events enable row level security;

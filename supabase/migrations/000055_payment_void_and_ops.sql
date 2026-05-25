-- Payment void tracking + lightweight ops tables

alter table public.payments
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text,
  add column if not exists voided_by uuid references public.profiles(id) on delete set null;

create table if not exists public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  amount_cents int not null default 0,
  notes text,
  receipt_url text,
  incurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.job_mileage_logs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete set null,
  fallback_booking_id uuid references public.booking_fallbacks(id) on delete set null,
  estimated_miles numeric,
  start_mileage numeric,
  end_mileage numeric,
  total_miles numeric,
  gas_cost_cents int,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

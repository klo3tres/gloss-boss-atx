-- Force patch: fleet inquiries, appointment lifecycle, expense receipts, mileage trip mode

create table if not exists public.fleet_inquiries (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  fleet_size text,
  message text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.appointments
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists rescheduled_from timestamptz;

alter table public.business_expenses
  add column if not exists receipt_url text,
  add column if not exists receipt_storage_path text;

alter table public.job_mileage_logs
  add column if not exists trip_mode text default 'round_trip',
  add column if not exists miles_one_way numeric,
  add column if not exists round_trip_miles numeric,
  add column if not exists logged_on timestamptz default now();

create index if not exists fleet_inquiries_created_at_idx on public.fleet_inquiries (created_at desc);

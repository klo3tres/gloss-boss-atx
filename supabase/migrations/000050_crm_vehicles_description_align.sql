-- Ensure CRM vehicle tables expose description for PostgREST (fixes schema cache errors).

alter table if exists public.vehicles
  add column if not exists description text;

alter table if exists public.vehicles
  add column if not exists notes text;

alter table if exists public.vehicles
  add column if not exists created_at timestamptz not null default now();

update public.vehicles
set description = coalesce(nullif(trim(description), ''), 'Vehicle')
where description is null;

alter table if exists public.customer_vehicles
  add column if not exists description text not null default '';

notify pgrst, 'reload schema';

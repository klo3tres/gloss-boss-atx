-- Extend loyalty_stamps table with admin_id, technician_id, and source column.

alter table if exists public.loyalty_stamps
  add column if not exists admin_id uuid references public.profiles(id) on delete set null,
  add column if not exists technician_id uuid references public.profiles(id) on delete set null,
  add column if not exists source text;

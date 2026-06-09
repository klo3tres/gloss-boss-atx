-- Extend loyalty_stamps table with additional auditing and void controls

alter table if exists public.loyalty_stamps
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists stamp_count integer default 1,
  add column if not exists note text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists voided boolean default false,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id) on delete set null;

-- Enable RLS on loyalty_stamps if not already done
alter table if exists public.loyalty_stamps enable row level security;

-- Add RLS policies for loyalty_stamps if they don't exist
drop policy if exists "Allow public read access to loyalty_stamps" on public.loyalty_stamps;
create policy "Allow public read access to loyalty_stamps"
  on public.loyalty_stamps for select
  using (true);

drop policy if exists "Allow staff write access to loyalty_stamps" on public.loyalty_stamps;
create policy "Allow staff write access to loyalty_stamps"
  on public.loyalty_stamps for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('tech', 'admin', 'super_admin')
    )
  );

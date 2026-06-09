-- Extended fleet inquiries, technician lead capture permissions, and RLS for business expenses/mileage logs.

-- 1. Extend fleet inquiries table
alter table public.fleet_inquiries
  add column if not exists internal_notes text,
  add column if not exists quote_amount_cents integer,
  add column if not exists quoted_services text,
  add column if not exists follow_up_date timestamptz,
  add column if not exists contact_history jsonb not null default '[]'::jsonb,
  add column if not exists assigned_technician_id uuid references public.profiles(id) on delete set null;

-- 2. Enable RLS and create insert policy for technician on leads
alter table public.leads enable row level security;

drop policy if exists leads_tech_insert on public.leads;
create policy leads_tech_insert on public.leads
  for insert with check (
    public.current_role() = 'technician'
    and assigned_technician_id = auth.uid()
  );

-- 3. Enable RLS and create policies for business_expenses
alter table public.business_expenses enable row level security;

drop policy if exists business_expenses_staff_all on public.business_expenses;
create policy business_expenses_staff_all on public.business_expenses
  for all using (public.is_staff()) with check (public.is_staff());

-- 4. Enable RLS and create policies for job_mileage_logs
alter table public.job_mileage_logs enable row level security;

drop policy if exists job_mileage_logs_staff_all on public.job_mileage_logs;
create policy job_mileage_logs_staff_all on public.job_mileage_logs
  for all using (public.is_staff()) with check (public.is_staff());

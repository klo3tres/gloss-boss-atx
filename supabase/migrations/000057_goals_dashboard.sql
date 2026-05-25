create table if not exists public.admin_goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  goal_type text not null default 'revenue_monthly',
  target_value numeric not null default 0,
  current_value numeric not null default 0,
  unit text not null default 'cents',
  period_start date,
  period_end date,
  technician_id uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'active',
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_goals_status_idx on public.admin_goals (status);
create index if not exists admin_goals_period_idx on public.admin_goals (period_end);

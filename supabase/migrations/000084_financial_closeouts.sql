-- Permanent daily and monthly financial closeout records.

create table if not exists public.financial_closeouts (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('daily', 'monthly')),
  period_key text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz not null default now(),
  note text,
  cash_cents integer not null default 0,
  stripe_cents integer not null default 0,
  zelle_cents integer not null default 0,
  deposits_collected_cents integer not null default 0,
  refunds_cents integer not null default 0,
  expenses_cents integer not null default 0,
  fuel_cents integer not null default 0,
  stripe_fees_cents integer not null default 0,
  gross_revenue_cents integer not null default 0,
  net_profit_cents integer not null default 0,
  margin_bps integer,
  open_balances_cents integer not null default 0,
  pending_deposits_cents integer not null default 0,
  completed_jobs integer not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (period_type, period_key)
);

create index if not exists idx_financial_closeouts_closed on public.financial_closeouts (closed_at desc);
create index if not exists idx_financial_closeouts_period on public.financial_closeouts (period_type, period_key desc);

alter table public.financial_closeouts enable row level security;

drop policy if exists financial_closeouts_staff_all on public.financial_closeouts;
create policy financial_closeouts_staff_all on public.financial_closeouts for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin','super_admin'))
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin','super_admin'))
);

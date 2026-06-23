-- Titan 1.0 — experiments + KPI attribution

create table if not exists public.titan_experiments (
  id uuid primary key default gen_random_uuid(),
  hypothesis text not null,
  actions_planned text not null default '',
  expected_revenue_cents integer not null default 0,
  test_length_days integer not null default 14,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  result text check (result is null or result in ('pass', 'fail', 'inconclusive')),
  result_notes text,
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists titan_experiments_status_idx on public.titan_experiments (status, started_at desc);

create table if not exists public.titan_kpi_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (
    kind in (
      'revenue_generated',
      'revenue_recovered',
      'customer_acquired',
      'partnership_acquired',
      'follow_up_completed',
      'referral_generated',
      'experiment_completed'
    )
  ),
  amount_cents integer not null default 0,
  label text not null default '',
  source_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists titan_kpi_events_kind_occurred_idx on public.titan_kpi_events (kind, occurred_at desc);

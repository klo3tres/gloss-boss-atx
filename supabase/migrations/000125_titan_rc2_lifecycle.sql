-- Titan RC2: lifecycle timeline events + message coach scores

create table if not exists public.customer_timeline_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  event_type text not null,
  title text not null,
  detail text,
  href text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists customer_timeline_events_customer_created_idx
  on public.customer_timeline_events (customer_id, created_at desc);

create index if not exists customer_timeline_events_type_idx
  on public.customer_timeline_events (event_type);

create table if not exists public.titan_message_scores (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('sms', 'email')),
  kind text not null default 'outreach',
  body_preview text,
  style_label text,
  response_probability integer not null default 0,
  reason text,
  suggested_improvement text,
  signals jsonb not null default '[]'::jsonb,
  entity_type text,
  entity_id text,
  customer_id uuid references public.customers (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists titan_message_scores_created_idx
  on public.titan_message_scores (created_at desc);

create index if not exists titan_message_scores_kind_idx
  on public.titan_message_scores (kind, response_probability desc);

alter table public.customer_timeline_events enable row level security;
alter table public.titan_message_scores enable row level security;

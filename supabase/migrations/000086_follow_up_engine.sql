-- Automated customer follow-up queue (30 / 60 / 90 day maintenance & win-back).

create table if not exists public.follow_up_settings (
  tier integer primary key check (tier in (30, 60, 90)),
  enabled boolean not null default true,
  sms_enabled boolean not null default true,
  email_enabled boolean not null default true,
  sms_template text not null,
  email_subject text not null,
  email_body text not null,
  promo_code text,
  updated_at timestamptz not null default now()
);

insert into public.follow_up_settings (tier, sms_template, email_subject, email_body, promo_code)
values
  (
    30,
    'Hi {{customer}}, your {{vehicle}} is due for a maintenance detail with Gloss Boss ATX. Book here: {{book_link}}',
    'Time for your maintenance detail?',
    'Hi {{customer}},\n\nYour {{vehicle}} is due for a maintenance detail. Keep it looking sharp with Gloss Boss ATX.\n\nBook online: {{book_link}}\n\n— Gloss Boss ATX',
    null
  ),
  (
    60,
    'Hi {{customer}}, it''s been a while since your last Gloss Boss detail. Ready to get back on the schedule? {{book_link}}',
    'We miss your shine — book your next detail',
    'Hi {{customer}},\n\nIt has been a while since your last Gloss Boss ATX service. We would love to get you back on the schedule.\n\nBook online: {{book_link}}\n\n— Gloss Boss ATX',
    null
  ),
  (
    90,
    'Hi {{customer}}, we would love to see you again — use code {{promo}} for 10% off your next detail. Book: {{book_link}}',
    '10% off your next Gloss Boss detail',
    'Hi {{customer}},\n\nWe noticed it has been a while since your last service. Come back with code {{promo}} for 10% off your next detail.\n\nBook online: {{book_link}}\n\n— Gloss Boss ATX',
    'GLOSS10'
  )
on conflict (tier) do nothing;

create table if not exists public.customer_follow_ups (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  customer_id uuid references public.customers (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  tier integer not null check (tier in (30, 60, 90)),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'cancelled', 'failed')),
  channel text,
  sent_at timestamptz,
  skipped_reason text,
  snoozed_until timestamptz,
  customer_name text,
  customer_email text,
  customer_phone text,
  vehicle_description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_follow_ups_status_due on public.customer_follow_ups (status, due_at);
create index if not exists idx_customer_follow_ups_customer on public.customer_follow_ups (customer_id);
create index if not exists idx_customer_follow_ups_appointment on public.customer_follow_ups (appointment_id);

create table if not exists public.follow_up_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  enqueued_count integer not null default 0,
  sent_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_follow_up_runs_started on public.follow_up_runs (started_at desc);

alter table public.follow_up_settings enable row level security;
alter table public.customer_follow_ups enable row level security;
alter table public.follow_up_runs enable row level security;

drop policy if exists follow_up_settings_staff on public.follow_up_settings;
create policy follow_up_settings_staff on public.follow_up_settings for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

drop policy if exists customer_follow_ups_staff on public.customer_follow_ups;
create policy customer_follow_ups_staff on public.customer_follow_ups for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

drop policy if exists follow_up_runs_staff_read on public.follow_up_runs;
create policy follow_up_runs_staff_read on public.follow_up_runs for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

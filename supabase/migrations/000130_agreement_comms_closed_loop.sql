-- P0: Customer agreement closed loop — requests, status, verbal ack, reminders

-- Canonical agreement request lifecycle (send → view → sign / verbal)
create table if not exists public.agreement_requests (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete set null,
  fallback_booking_id uuid,
  work_order_id uuid,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid,
  template_id uuid,
  template_version integer not null default 1,
  status text not null default 'not_sent'
    check (status in (
      'not_created', 'not_sent', 'scheduled', 'sent', 'delivered', 'viewed',
      'signed', 'verbal', 'declined_optional_media', 'failed_delivery',
      'expired', 'voided', 'requires_resign'
    )),
  token_hash text not null,
  token_expires_at timestamptz not null,
  secure_path text,
  delivery_channel text,
  failure_reason text,
  scheduled_send_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  verbal_at timestamptz,
  signed_agreement_id uuid,
  signer_name text,
  marketing_media_consent boolean,
  operational_photo_consent boolean default true,
  sms_consent_selection boolean,
  terms_snapshot text,
  void_reason text,
  resign_reason text,
  created_by uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agreement_requests_token_hash_uidx
  on public.agreement_requests (token_hash);
create index if not exists agreement_requests_appointment_idx
  on public.agreement_requests (appointment_id, created_at desc);
create index if not exists agreement_requests_status_idx
  on public.agreement_requests (status, scheduled_send_at);
create index if not exists agreement_requests_customer_idx
  on public.agreement_requests (customer_id, created_at desc);

alter table public.agreement_requests enable row level security;

drop policy if exists agreement_requests_staff_all on public.agreement_requests;
create policy agreement_requests_staff_all on public.agreement_requests
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- Verbal acknowledgment columns on signed_agreements
alter table public.signed_agreements add column if not exists acknowledgment_mode text;
alter table public.signed_agreements add column if not exists verbal_recorded_by uuid;
alter table public.signed_agreements add column if not exists verbal_customer_name text;
alter table public.signed_agreements add column if not exists verbal_reason text;
alter table public.signed_agreements add column if not exists verbal_witness_name text;
alter table public.signed_agreements add column if not exists marketing_media_consent boolean;
alter table public.signed_agreements add column if not exists operational_photo_consent boolean;
alter table public.signed_agreements add column if not exists agreement_request_id uuid;
alter table public.signed_agreements add column if not exists terms_version integer;

-- Denormalized work-order status (app also writes this)
alter table public.work_orders add column if not exists agreement_status text;
alter table public.work_orders add column if not exists agreement_request_id uuid;
alter table public.work_orders add column if not exists agreement_signed_at timestamptz;
alter table public.work_orders add column if not exists agreement_viewed_at timestamptz;

-- Appointment denormalized helpers
alter table public.appointments add column if not exists agreement_status text;
alter table public.appointments add column if not exists agreement_request_id uuid;

-- Agreement reminder cadence rules
insert into public.notification_cadence_rules (
  rule_key, label, enabled, sms_enabled, email_enabled,
  delay_hours, delay_days, sms_template, email_subject, email_body, sort_order
)
values
  (
    'agreement_immediate',
    'Agreement — send after booking confirmed',
    true, true, true,
    0, 0,
    'Hi {{customer}}, before your Gloss Boss ATX detail, please review and sign your service acknowledgment: {{agreement_link}} Reply STOP to opt out.',
    'Please sign your Gloss Boss ATX service acknowledgment',
    'Hi {{customer}},\n\nPlease review and sign your Gloss Boss ATX service acknowledgment for your upcoming appointment:\n{{agreement_link}}\n\nIt only takes a minute.\n\n— Gloss Boss ATX',
    15
  ),
  (
    'agreement_24h_before',
    'Agreement — 24h before if unsigned',
    true, true, true,
    24, 0,
    'Hi {{customer}}, reminder: please sign your Gloss Boss ATX service acknowledgment before tomorrow''s detail: {{agreement_link}} Reply STOP to opt out.',
    'Reminder: sign your service acknowledgment',
    'Hi {{customer}},\n\nYour appointment is tomorrow. Please sign your service acknowledgment before we begin:\n{{agreement_link}}\n\n— Gloss Boss ATX',
    16
  ),
  (
    'agreement_2h_before',
    'Agreement — 2h before if unsigned',
    true, true, true,
    2, 0,
    'Hi {{customer}}, we''re almost ready for your detail. Please sign your Gloss Boss ATX acknowledgment: {{agreement_link}} Reply STOP to opt out.',
    'Final reminder: service acknowledgment',
    'Hi {{customer}},\n\nWe''re almost ready for your appointment. Please sign your service acknowledgment:\n{{agreement_link}}\n\n— Gloss Boss ATX',
    17
  ),
  (
    'agreement_60m_before',
    'Agreement — 60m before if unsigned (optional)',
    false, true, true,
    1, 0,
    'Hi {{customer}}, last chance to sign your Gloss Boss ATX service acknowledgment before service: {{agreement_link}} Reply STOP to opt out.',
    'Last chance: sign your acknowledgment',
    'Hi {{customer}},\n\nPlease sign your service acknowledgment before we arrive:\n{{agreement_link}}\n\n— Gloss Boss ATX',
    18
  )
on conflict (rule_key) do nothing;

-- Durable marketing campaigns (beyond site_settings JSON)
create table if not exists public.customer_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null default 'email' check (channel in ('sms', 'email', 'both')),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'scheduled', 'sending', 'sent', 'delivered', 'failed', 'canceled', 'paused')),
  audience_key text not null default 'eligible_marketing',
  audience_label text,
  message_quick text,
  message_professional text,
  message_warm text,
  message_selected text not null default '',
  offer_code text,
  offer_id uuid,
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipients_selected integer not null default 0,
  recipients_eligible integer not null default 0,
  recipients_excluded integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  failed_count integer not null default 0,
  click_count integer not null default 0,
  booking_count integer not null default 0,
  revenue_cents integer not null default 0,
  opt_out_count integer not null default 0,
  created_by uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_campaigns_status_idx on public.customer_campaigns (status, scheduled_at);

alter table public.customer_campaigns enable row level security;

drop policy if exists customer_campaigns_admin_all on public.customer_campaigns;
create policy customer_campaigns_admin_all on public.customer_campaigns
  for all
  using (public.is_admin_level())
  with check (public.is_admin_level());

create table if not exists public.customer_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.customer_campaigns(id) on delete cascade,
  customer_id uuid,
  email text,
  phone text,
  status text not null default 'pending'
    check (status in ('pending', 'excluded', 'sent', 'delivered', 'failed', 'replied', 'booked', 'opted_out')),
  exclude_reason text,
  provider_id text,
  error_message text,
  booked_appointment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_campaign_recipients_campaign_idx
  on public.customer_campaign_recipients (campaign_id, status);

alter table public.customer_campaign_recipients enable row level security;

drop policy if exists customer_campaign_recipients_admin_all on public.customer_campaign_recipients;
create policy customer_campaign_recipients_admin_all on public.customer_campaign_recipients
  for all
  using (public.is_admin_level())
  with check (public.is_admin_level());

-- Agreement timeline events (lightweight)
create table if not exists public.agreement_events (
  id uuid primary key default gen_random_uuid(),
  agreement_request_id uuid references public.agreement_requests(id) on delete cascade,
  appointment_id uuid,
  customer_id uuid,
  event_type text not null,
  detail text,
  actor_user_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agreement_events_request_idx on public.agreement_events (agreement_request_id, created_at desc);
create index if not exists agreement_events_appointment_idx on public.agreement_events (appointment_id, created_at desc);

alter table public.agreement_events enable row level security;

drop policy if exists agreement_events_staff_read on public.agreement_events;
create policy agreement_events_staff_read on public.agreement_events
  for select
  using (public.is_staff());

drop policy if exists agreement_events_staff_insert on public.agreement_events;
create policy agreement_events_staff_insert on public.agreement_events
  for insert
  with check (public.is_staff());

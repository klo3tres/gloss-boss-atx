-- Gloss Boss ATX — quality hard reset (additive only)

alter table if exists public.job_media
  add column if not exists vehicle_label text;

alter table if exists public.job_media
  add column if not exists uploaded_by_name text;

alter table if exists public.notification_outbox
  add column if not exists provider_error text;

alter table if exists public.messages
  add column if not exists draft_body text;

alter table if exists public.messages
  add column if not exists thread_id uuid;

alter table if exists public.signed_agreements
  add column if not exists service_address text;

alter table if exists public.receipts
  add column if not exists receipt_number text;

create table if not exists public.integration_test_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  status text not null default 'skipped',
  destination text,
  error_message text,
  actor_id uuid,
  created_at timestamptz not null default now()
);

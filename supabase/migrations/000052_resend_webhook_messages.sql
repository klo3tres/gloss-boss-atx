-- Resend unified webhook: richer inbound message storage (additive)

alter table public.messages add column if not exists to_email text;
alter table public.messages add column if not exists raw_payload jsonb;
alter table public.messages add column if not exists resend_webhook_event_id text;

create unique index if not exists idx_messages_resend_webhook_event_id
  on public.messages(resend_webhook_event_id)
  where resend_webhook_event_id is not null;

alter table public.integration_test_events add column if not exists provider_message_id text;
alter table public.integration_test_events add column if not exists event_type text;

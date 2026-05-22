-- Inbound email dedupe + CRM metadata (additive)

alter table public.messages add column if not exists inbound_email_id text;
alter table public.messages add column if not exists source text default 'website';

create unique index if not exists idx_messages_inbound_email_id
  on public.messages(inbound_email_id)
  where inbound_email_id is not null;

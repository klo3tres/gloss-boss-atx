alter table public.scheduled_messages add column if not exists provider text;
alter table public.scheduled_messages add column if not exists provider_message_id text;
alter table public.scheduled_messages add column if not exists attempt_count integer not null default 0;
alter table public.scheduled_messages add column if not exists last_attempt_at timestamptz;
alter table public.scheduled_messages add column if not exists delivered_at timestamptz;
alter table public.scheduled_messages add column if not exists replied_at timestamptz;

alter table public.scheduled_messages drop constraint if exists scheduled_messages_status_check;
alter table public.scheduled_messages add constraint scheduled_messages_status_check check (
  status in ('draft', 'approved', 'scheduled', 'queued', 'sending', 'sent', 'delivered', 'failed', 'replied', 'booked', 'paid', 'cancelled', 'skipped')
);

create index if not exists scheduled_messages_provider_id_idx
  on public.scheduled_messages (provider, provider_message_id)
  where provider_message_id is not null;

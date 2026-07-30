-- Keep both historical spellings valid while application writers converge on
-- the canonical "cancelled" status. Migration 000139's cancellation RPC uses
-- "canceled", while the delivery pipeline constraint originally allowed only
-- "cancelled".

alter table public.scheduled_messages
  drop constraint if exists scheduled_messages_status_check;

alter table public.scheduled_messages
  add constraint scheduled_messages_status_check check (
    status in (
      'draft',
      'approved',
      'scheduled',
      'queued',
      'sending',
      'sent',
      'delivered',
      'failed',
      'replied',
      'booked',
      'paid',
      'cancelled',
      'canceled',
      'skipped'
    )
  );

insert into public.site_settings (key, value)
values (
  'migration_marker_000149',
  jsonb_build_object(
    'name',
    'cancellation_status_compatibility',
    'applied',
    true,
    'version',
    149
  )
)
on conflict (key) do update
set value = excluded.value, updated_at = now();

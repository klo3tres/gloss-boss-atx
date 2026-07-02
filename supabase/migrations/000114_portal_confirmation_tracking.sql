-- Portal link + confirmation delivery tracking on appointments
alter table if exists public.appointments
  add column if not exists portal_link_created_at timestamptz,
  add column if not exists portal_link_last_sent_at timestamptz,
  add column if not exists portal_link_last_opened_at timestamptz,
  add column if not exists customer_claimed_account_at timestamptz;

alter table if exists public.customers
  add column if not exists portal_account_linked_at timestamptz;

create index if not exists idx_appointments_portal_link_sent
  on public.appointments (portal_link_last_sent_at desc)
  where portal_link_last_sent_at is not null;

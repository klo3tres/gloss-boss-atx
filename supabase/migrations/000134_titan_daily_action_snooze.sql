alter table public.titan_daily_actions
  add column if not exists snoozed_until timestamptz;

create index if not exists titan_daily_actions_snoozed_idx
  on public.titan_daily_actions (status, snoozed_until)
  where status = 'pending';

-- Correct loyalty redemption consumption: the configured threshold is the
-- number of punches required, not threshold + one.
create or replace function public.record_loyalty_reset_on_credit_redemption()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_payload jsonb := '{}'::jsonb;
  v_threshold integer := 5;
  v_behavior text := 'subtract_threshold';
  v_total integer := 0;
  v_consumed integer := 0;
  v_prior integer := 0;
  v_tiers jsonb := '[]'::jsonb;
  v_tier_index integer := 0;
begin
  if new.type <> 'loyalty_reward' or new.status <> 'used' or old.status = 'used' then return new; end if;
  select greatest(1, coalesce(services_required, 5)), coalesce(reward_payload, '{}'::jsonb)
    into v_threshold, v_payload
    from public.loyalty_rules where active is true order by created_at desc limit 1;
  v_behavior := case when v_payload->>'reset_behavior' in ('reset_to_zero', 'subtract_threshold', 'advance_tier') then v_payload->>'reset_behavior' else 'subtract_threshold' end;
  select coalesce(sum(coalesce(stamp_count, 1)), 0)::integer into v_total
    from public.loyalty_stamps where customer_id = new.customer_id and coalesce(voided, false) is false and voided_at is null;
  select count(*)::integer into v_prior from public.loyalty_reset_events where customer_id = new.customer_id;
  if v_behavior = 'reset_to_zero' then
    select greatest(0, v_total - coalesce(sum(consumed_punches), 0))::integer into v_consumed from public.loyalty_reset_events where customer_id = new.customer_id;
  elsif v_behavior = 'advance_tier' then
    v_tiers := coalesce(v_payload->'tier_thresholds', '[]'::jsonb);
    if jsonb_typeof(v_tiers) <> 'array' then v_tiers := '[]'::jsonb; end if;
    v_tier_index := least(v_prior, greatest(0, jsonb_array_length(v_tiers) - 1));
    if jsonb_array_length(v_tiers) > 0 then v_threshold := greatest(1, coalesce((v_tiers->>v_tier_index)::integer, v_threshold)); end if;
    v_consumed := v_threshold;
  else
    v_consumed := v_threshold;
  end if;
  insert into public.loyalty_reset_events (customer_id, credit_id, reset_behavior, consumed_punches, punch_total_at_redemption)
  values (new.customer_id, new.id, v_behavior, greatest(0, v_consumed), v_total)
  on conflict (credit_id) do nothing;
  return new;
end;
$$;

-- Repair rows produced by the previous off-by-one implementation for the
-- subtract-threshold behavior. Reset-to-zero rows intentionally retain their
-- historical consumed amount.
update public.loyalty_reset_events lre
set consumed_punches = greatest(1, coalesce((
  select services_required
  from public.loyalty_rules
  where active is true
  order by created_at desc
  limit 1
), 5))
where lre.reset_behavior = 'subtract_threshold'
  and lre.consumed_punches = greatest(1, coalesce((
    select services_required
    from public.loyalty_rules
    where active is true
    order by created_at desc
    limit 1
  ), 5)) + 1;

create table if not exists public.conversion_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  session_id text,
  appointment_id uuid references public.appointments(id) on delete set null,
  source_path text,
  metadata jsonb not null default '{}'::jsonb,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists conversion_events_type_created_idx on public.conversion_events (event_type, created_at desc);
create index if not exists conversion_events_session_idx on public.conversion_events (session_id, created_at);
alter table public.conversion_events enable row level security;
drop policy if exists "Staff read conversion events" on public.conversion_events;
create policy "Staff read conversion events" on public.conversion_events for select using (public.is_staff());

-- Write the parity marker last so it can only advertise the migration after
-- every schema object above has been created successfully.
insert into public.site_settings (key, value)
values (
  'migration_marker_000138',
  jsonb_build_object(
    'name', 'referral_and_loyalty_correctness',
    'applied', true,
    'version', 138
  )
)
on conflict (key) do update set value = excluded.value;

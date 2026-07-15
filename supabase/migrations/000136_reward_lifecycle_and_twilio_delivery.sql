alter table public.notification_outbox
  add column if not exists provider_status text,
  add column if not exists status_updated_at timestamptz,
  add column if not exists delivered_at timestamptz;

create index if not exists notification_outbox_provider_message_idx
  on public.notification_outbox (provider, provider_message_id)
  where provider_message_id is not null;

alter table public.staff_invites
  add column if not exists sms_delivery_status text,
  add column if not exists sms_delivery_error text,
  add column if not exists sms_delivery_updated_at timestamptz;

alter table public.referral_rewards
  add column if not exists issuance_key text,
  add column if not exists reward_scope text not null default 'base',
  add column if not exists milestone_threshold integer,
  add column if not exists eligibility jsonb not null default '{}'::jsonb,
  add column if not exists selected_addon_slug text,
  add column if not exists reserved_appointment_id uuid references public.appointments(id) on delete set null;

update public.referral_rewards
set issuance_key = case
  when metadata->>'appointment_id' is not null then 'referral-base:' || (metadata->>'appointment_id')
  else 'legacy:' || id::text
end
where issuance_key is null;

alter table public.referral_rewards alter column issuance_key set not null;
drop index if exists public.referral_rewards_one_per_appointment_idx;
create unique index if not exists referral_rewards_issuance_key_idx on public.referral_rewards (issuance_key);

alter table public.referral_rewards drop constraint if exists referral_rewards_status_check;
alter table public.referral_rewards add constraint referral_rewards_status_check check (
  status in ('locked', 'progress', 'pending', 'issued', 'available', 'selected', 'reserved', 'redeemed', 'expired', 'voided')
);

create table if not exists public.loyalty_reset_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  credit_id uuid not null unique references public.customer_credits(id) on delete cascade,
  reset_behavior text not null check (reset_behavior in ('reset_to_zero', 'subtract_threshold', 'advance_tier')),
  consumed_punches integer not null check (consumed_punches >= 0),
  punch_total_at_redemption integer not null check (punch_total_at_redemption >= 0),
  created_at timestamptz not null default now()
);

create index if not exists loyalty_reset_events_customer_idx on public.loyalty_reset_events (customer_id, created_at);
alter table public.loyalty_reset_events enable row level security;
drop policy if exists "Staff manage loyalty reset events" on public.loyalty_reset_events;
create policy "Staff manage loyalty reset events" on public.loyalty_reset_events for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Customers read loyalty reset events" on public.loyalty_reset_events;
create policy "Customers read loyalty reset events" on public.loyalty_reset_events for select using (
  exists (select 1 from public.customers c where c.id = customer_id and lower(c.email) = lower(coalesce(auth.jwt()->>'email', '')))
);

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
  select coalesce(services_required, 5), coalesce(reward_payload, '{}'::jsonb)
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
    v_consumed := v_threshold + 1;
  else
    v_consumed := v_threshold + 1;
  end if;
  insert into public.loyalty_reset_events (customer_id, credit_id, reset_behavior, consumed_punches, punch_total_at_redemption)
  values (new.customer_id, new.id, v_behavior, greatest(0, v_consumed), v_total)
  on conflict (credit_id) do nothing;
  return new;
end;
$$;

drop trigger if exists customer_credit_loyalty_reset_trigger on public.customer_credits;
create trigger customer_credit_loyalty_reset_trigger after update of status on public.customer_credits
for each row execute function public.record_loyalty_reset_on_credit_redemption();

with active_rule as (
  select
    greatest(1, coalesce(services_required, 5))::integer as threshold,
    case when reward_payload->>'reset_behavior' in ('reset_to_zero', 'subtract_threshold', 'advance_tier')
      then reward_payload->>'reset_behavior' else 'subtract_threshold' end as behavior,
    case when jsonb_typeof(reward_payload->'tier_thresholds') = 'array' then reward_payload->'tier_thresholds' else '[]'::jsonb end as tiers
  from public.loyalty_rules where active is true order by created_at desc limit 1
), used_credits as (
  select
    cc.id,
    cc.customer_id,
    coalesce(cc.redeemed_at, cc.issued_at, cc.created_at) as redeemed_at,
    row_number() over (partition by cc.customer_id order by coalesce(cc.redeemed_at, cc.issued_at, cc.created_at), cc.id) - 1 as reward_index
  from public.customer_credits cc
  where cc.type = 'loyalty_reward' and cc.status = 'used'
), totals as (
  select
    uc.*,
    coalesce((select sum(coalesce(ls.stamp_count, 1)) from public.loyalty_stamps ls
      where ls.customer_id = uc.customer_id and coalesce(ls.voided, false) is false and ls.voided_at is null and ls.created_at <= uc.redeemed_at), 0)::integer as punch_total
  from used_credits uc
), with_previous as (
  select totals.*, lag(punch_total, 1, 0) over (partition by customer_id order by redeemed_at, id) as prior_punch_total
  from totals
)
insert into public.loyalty_reset_events (customer_id, credit_id, reset_behavior, consumed_punches, punch_total_at_redemption)
select
  p.customer_id,
  p.id,
  coalesce(r.behavior, 'subtract_threshold'),
  case
    when r.behavior = 'reset_to_zero' then greatest(0, p.punch_total - p.prior_punch_total)
    when r.behavior = 'advance_tier' and jsonb_array_length(coalesce(r.tiers, '[]'::jsonb)) > 0 then
      greatest(1, coalesce((r.tiers->>least(p.reward_index::integer, jsonb_array_length(r.tiers) - 1))::integer, r.threshold, 5)) + 1
    else coalesce(r.threshold, 5) + 1
  end,
  p.punch_total
from with_previous p
left join active_rule r on true
on conflict (credit_id) do nothing;

create or replace function public.release_reserved_referral_reward()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.referral_rewards
    set status = 'available', reserved_appointment_id = null
    where reserved_appointment_id = old.id and status in ('selected', 'reserved');
    return old;
  end if;
  if new.status in ('cancelled', 'canceled', 'voided', 'declined') then
    update public.referral_rewards
    set status = 'available', reserved_appointment_id = null
    where reserved_appointment_id = old.id and status in ('selected', 'reserved');
  end if;
  return new;
end;
$$;

drop trigger if exists appointment_release_referral_reward_update on public.appointments;
create trigger appointment_release_referral_reward_update after update of status on public.appointments
for each row when (old.status is distinct from new.status) execute function public.release_reserved_referral_reward();
drop trigger if exists appointment_release_referral_reward_delete on public.appointments;
create trigger appointment_release_referral_reward_delete before delete on public.appointments
for each row execute function public.release_reserved_referral_reward();

create or replace function public.sync_referral_reward_credit_redemption()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reward_id uuid;
  v_customer_id uuid;
  v_label text;
begin
  if new.status = 'used' and old.status is distinct from 'used' then
    update public.referral_rewards
    set status = 'redeemed', redeemed_at = coalesce(new.redeemed_at, now()), reserved_appointment_id = new.linked_work_order_id
    where customer_credit_id = new.id and status in ('issued', 'available', 'selected', 'reserved')
    returning id, customer_id, reward_label into v_reward_id, v_customer_id, v_label;
    if v_reward_id is not null then
      insert into public.customer_timeline_events (customer_id, event_type, title, detail, href, metadata)
      values (v_customer_id, 'referral_reward_redeemed', 'Referral credit redeemed', coalesce(v_label, 'Referral credit'),
        '/portal/job?appointment_id=' || coalesce(new.linked_work_order_id::text, ''),
        jsonb_build_object('referral_reward_id', v_reward_id, 'credit_id', new.id, 'appointment_id', new.linked_work_order_id));
      insert into public.titan_activity_events (kind, title, detail, impact_cents, href, metadata, occurred_at)
      values ('referral_reward_redeemed', 'Referral credit redeemed', coalesce(v_label, 'Referral credit'), new.amount_cents,
        '/admin/work-orders/' || coalesce(new.linked_work_order_id::text, ''),
        jsonb_build_object('customer_id', v_customer_id, 'referral_reward_id', v_reward_id, 'credit_id', new.id, 'appointment_id', new.linked_work_order_id), now());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists customer_credit_referral_reward_trigger on public.customer_credits;
create trigger customer_credit_referral_reward_trigger after update of status on public.customer_credits
for each row execute function public.sync_referral_reward_credit_redemption();

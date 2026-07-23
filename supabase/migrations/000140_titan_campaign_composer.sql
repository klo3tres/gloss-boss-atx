-- Titan Campaign Composer: durable per-recipient delivery and closed-loop attribution.
-- Vercel Hobby-safe: batches are claimed by an owner-triggered worker, never a frequent cron.

alter table if exists public.customer_campaigns
  add column if not exists subject text,
  add column if not exists email_body text,
  add column if not exists social_caption text,
  add column if not exists selected_tone text not null default 'professional',
  add column if not exists recommended_service_slug text,
  add column if not exists destination_path text not null default '/book',
  add column if not exists expires_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists booking_start_count integer not null default 0,
  add column if not exists completed_job_count integer not null default 0,
  add column if not exists queued_count integer not null default 0;

alter table if exists public.customer_campaign_recipients
  drop constraint if exists customer_campaign_recipients_status_check,
  drop constraint if exists customer_campaign_recipients_channel_check;

alter table if exists public.customer_campaign_recipients
  add column if not exists channel text not null default 'sms',
  add column if not exists selected boolean not null default true,
  add column if not exists tracking_token text,
  add column if not exists idempotency_key text,
  add column if not exists rendered_subject text,
  add column if not exists rendered_body text,
  add column if not exists personalization jsonb not null default '{}'::jsonb,
  add column if not exists eligibility jsonb not null default '{}'::jsonb,
  add column if not exists queued_at timestamptz,
  add column if not exists scheduled_for timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists clicked_at timestamptz,
  add column if not exists booking_started_at timestamptz,
  add column if not exists booked_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists revenue_cents integer not null default 0,
  add column if not exists promotion_id uuid,
  add column if not exists promotion_code text;

update public.customer_campaign_recipients
set tracking_token = replace(gen_random_uuid()::text, '-', '')
where tracking_token is null;

update public.customer_campaign_recipients
set idempotency_key = campaign_id::text || ':legacy:' || id::text || ':' || channel
where idempotency_key is null;

alter table if exists public.customer_campaign_recipients
  alter column tracking_token set default replace(gen_random_uuid()::text, '-', ''),
  alter column tracking_token set not null,
  alter column status set default 'draft',
  add constraint customer_campaign_recipients_status_check check (
    status in ('draft','pending','excluded','queued','scheduled','processing','paused','sent','delivered','failed','permanent_failure','replied','booked','completed','opted_out','canceled','skipped')
  ),
  add constraint customer_campaign_recipients_channel_check check (channel in ('sms','email'));

create unique index if not exists customer_campaign_recipients_tracking_token_uidx
  on public.customer_campaign_recipients (tracking_token);
create unique index if not exists customer_campaign_recipients_idempotency_uidx
  on public.customer_campaign_recipients (idempotency_key);
create index if not exists customer_campaign_recipients_queue_idx
  on public.customer_campaign_recipients (campaign_id, status, scheduled_for, next_attempt_at);
create index if not exists customer_campaign_recipients_customer_idx
  on public.customer_campaign_recipients (customer_id, created_at desc);

alter table if exists public.appointments
  add column if not exists campaign_id uuid references public.customer_campaigns(id) on delete set null,
  add column if not exists campaign_recipient_id uuid references public.customer_campaign_recipients(id) on delete set null,
  add column if not exists campaign_tracking_token text;

create index if not exists appointments_campaign_idx on public.appointments (campaign_id, campaign_recipient_id);

create table if not exists public.customer_campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.customer_campaigns(id) on delete cascade,
  recipient_id uuid references public.customer_campaign_recipients(id) on delete cascade,
  customer_id uuid,
  appointment_id uuid,
  event_type text not null,
  channel text,
  amount_cents integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists customer_campaign_events_campaign_idx
  on public.customer_campaign_events (campaign_id, event_type, created_at desc);
create index if not exists customer_campaign_events_recipient_idx
  on public.customer_campaign_events (recipient_id, created_at desc);

alter table public.customer_campaign_events enable row level security;
drop policy if exists customer_campaign_events_admin_all on public.customer_campaign_events;
create policy customer_campaign_events_admin_all on public.customer_campaign_events
  for all using (public.is_admin_level()) with check (public.is_admin_level());

create or replace function public.claim_customer_campaign_batch(p_campaign_id uuid, p_limit integer default 10)
returns setof public.customer_campaign_recipients
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin_level() then
    raise exception 'Not authorized';
  end if;

  return query
  with candidates as (
    select r.id
    from public.customer_campaign_recipients r
    join public.customer_campaigns c on c.id = r.campaign_id
    where r.campaign_id = p_campaign_id
      and c.status in ('approved','scheduled','sending')
      and (c.expires_at is null or c.expires_at > now())
      and r.selected is true
      and r.status in ('queued','scheduled','failed')
      and (r.scheduled_for is null or r.scheduled_for <= now())
      and (r.next_attempt_at is null or r.next_attempt_at <= now())
      and r.attempt_count < r.max_attempts
    order by r.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 25))
  ), updated as (
    update public.customer_campaign_recipients r
    set status = 'processing', processing_started_at = now(), attempt_count = r.attempt_count + 1, updated_at = now()
    from candidates c
    where r.id = c.id
    returning r.*
  )
  select * from updated;
end;
$$;

revoke all on function public.claim_customer_campaign_batch(uuid, integer) from public;
grant execute on function public.claim_customer_campaign_batch(uuid, integer) to authenticated, service_role;

create or replace function public.sync_campaign_payment_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_campaign uuid;
  v_revenue integer;
begin
  select a.campaign_recipient_id, a.campaign_id into v_recipient, v_campaign
  from public.appointments a where a.id = new.appointment_id;
  if v_recipient is null or v_campaign is null then return new; end if;

  select coalesce(sum(greatest(0, coalesce(p.amount_cents,0) - coalesce(p.refunded_amount_cents,0))),0)::integer
  into v_revenue
  from public.payments p
  where p.appointment_id = new.appointment_id
    and lower(coalesce(p.status,'')) in ('paid','succeeded')
    and coalesce(p.exclude_from_revenue,false) is false
    and coalesce(p.is_test,false) is false
    and p.voided_at is null;

  update public.customer_campaign_recipients
  set revenue_cents = v_revenue, booked_at = coalesce(booked_at, now()),
      booked_appointment_id = new.appointment_id,
      status = case when status = 'completed' then status else 'booked' end,
      updated_at = now()
  where id = v_recipient;

  update public.customer_campaigns c
  set revenue_cents = (select coalesce(sum(r.revenue_cents),0)::integer from public.customer_campaign_recipients r where r.campaign_id = v_campaign),
      booking_count = (select count(*)::integer from public.customer_campaign_recipients r where r.campaign_id = v_campaign and r.booked_at is not null),
      updated_at = now()
  where c.id = v_campaign;

  insert into public.customer_campaign_events (campaign_id, recipient_id, appointment_id, event_type, amount_cents, meta)
  values (v_campaign, v_recipient, new.appointment_id, 'revenue_updated', v_revenue, jsonb_build_object('payment_id', new.id))
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists payments_campaign_attribution_trigger on public.payments;
create trigger payments_campaign_attribution_trigger
after insert or update of status, amount_cents, refunded_amount_cents, voided_at, exclude_from_revenue
on public.payments for each row execute function public.sync_campaign_payment_attribution();

create or replace function public.sync_campaign_job_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.campaign_recipient_id is null or new.campaign_id is null then return new; end if;
  if lower(coalesce(new.status,'')) = 'completed' and lower(coalesce(old.status,'')) <> 'completed' then
    update public.customer_campaign_recipients set status = 'completed', completed_at = coalesce(new.job_completed_at, now()), updated_at = now()
    where id = new.campaign_recipient_id;
    update public.customer_campaigns c
    set completed_job_count = (select count(*)::integer from public.customer_campaign_recipients r where r.campaign_id = new.campaign_id and r.completed_at is not null), updated_at = now()
    where c.id = new.campaign_id;
    insert into public.customer_campaign_events (campaign_id, recipient_id, customer_id, appointment_id, event_type)
    values (new.campaign_id, new.campaign_recipient_id, new.customer_id, new.id, 'service_completed');
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_campaign_completion_trigger on public.appointments;
create trigger appointments_campaign_completion_trigger
after update of status on public.appointments for each row execute function public.sync_campaign_job_completion();

insert into public.site_settings (key, value)
values ('migration_marker_000140', jsonb_build_object('name', 'titan_campaign_composer', 'applied', true, 'version', 140))
on conflict (key) do update set value = excluded.value, updated_at = now();

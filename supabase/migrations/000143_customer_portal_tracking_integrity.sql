-- Customer portal preview and privacy-safe event integrity.

alter table public.appointments
  add column if not exists portal_link_last_regenerated_at timestamptz,
  add column if not exists portal_link_revoked_at timestamptz,
  add column if not exists portal_link_first_opened_at timestamptz,
  add column if not exists portal_link_open_count integer not null default 0,
  add column if not exists acknowledgement_started_at timestamptz,
  add column if not exists payment_page_opened_at timestamptz,
  add column if not exists account_claim_started_at timestamptz,
  add column if not exists account_created_at timestamptz;

create table if not exists public.customer_portal_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  token_fingerprint text,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  channel_source text,
  campaign_message_id text,
  device_type text,
  browser_family text,
  ip_hash text,
  user_agent_classification text,
  admin_preview boolean not null default false,
  bot_suspected boolean not null default false,
  counted boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists customer_portal_events_appointment_idx
  on public.customer_portal_events (appointment_id, occurred_at desc);
create index if not exists customer_portal_events_customer_idx
  on public.customer_portal_events (customer_id, occurred_at desc);

alter table public.customer_portal_events enable row level security;
drop policy if exists customer_portal_events_staff_read on public.customer_portal_events;
create policy customer_portal_events_staff_read on public.customer_portal_events
  for select to authenticated using (public.is_staff());

create or replace function public.record_customer_portal_event(
  p_appointment_id uuid,
  p_customer_id uuid,
  p_token_fingerprint text,
  p_event_type text,
  p_channel_source text,
  p_campaign_message_id text,
  p_device_type text,
  p_browser_family text,
  p_ip_hash text,
  p_user_agent_classification text,
  p_admin_preview boolean,
  p_bot_suspected boolean,
  p_counted boolean,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_now timestamptz := now();
begin
  insert into public.customer_portal_events (
    appointment_id, customer_id, token_fingerprint, event_type, occurred_at,
    channel_source, campaign_message_id, device_type, browser_family, ip_hash,
    user_agent_classification, admin_preview, bot_suspected, counted, metadata
  ) values (
    p_appointment_id, p_customer_id, p_token_fingerprint, p_event_type, v_now,
    p_channel_source, p_campaign_message_id, p_device_type, p_browser_family, p_ip_hash,
    p_user_agent_classification, p_admin_preview, p_bot_suspected, p_counted,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_id;

  if p_counted then
    if p_event_type = 'portal_opened' then
      update public.appointments
      set portal_link_first_opened_at = coalesce(portal_link_first_opened_at, v_now),
          portal_link_last_opened_at = v_now,
          portal_link_open_count = coalesce(portal_link_open_count, 0) + 1,
          updated_at = v_now
      where id = p_appointment_id;
    elsif p_event_type = 'acknowledgement_started' then
      update public.appointments
      set acknowledgement_started_at = coalesce(acknowledgement_started_at, v_now),
          updated_at = v_now
      where id = p_appointment_id;
    elsif p_event_type = 'payment_page_opened' then
      update public.appointments
      set payment_page_opened_at = v_now, updated_at = v_now
      where id = p_appointment_id;
    elsif p_event_type = 'account_claim_started' then
      update public.appointments
      set account_claim_started_at = coalesce(account_claim_started_at, v_now),
          updated_at = v_now
      where id = p_appointment_id;
    elsif p_event_type = 'account_created' then
      update public.appointments
      set account_created_at = coalesce(account_created_at, v_now),
          updated_at = v_now
      where id = p_appointment_id;
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.record_customer_portal_event(
  uuid, uuid, text, text, text, text, text, text, text, text, boolean, boolean, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.record_customer_portal_event(
  uuid, uuid, text, text, text, text, text, text, text, text, boolean, boolean, boolean, jsonb
) to service_role;

insert into public.site_settings(key,value)
values ('migration_marker_000143', jsonb_build_object('name','customer_portal_tracking_integrity','applied',true,'version',143))
on conflict (key) do update set value=excluded.value, updated_at=now();

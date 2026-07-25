-- Durable public booking sessions, atomic slot holds, and explicit account-claim state.

create table if not exists public.booking_slot_holds (
  id uuid primary key default gen_random_uuid(),
  booking_session_id text not null unique,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  status text not null default 'held'
    check (status in ('held', 'converting_to_checkout', 'booked', 'expired', 'released', 'cancelled')),
  expires_at timestamptz not null,
  appointment_id uuid references public.appointments(id) on delete set null,
  is_test boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_slot_holds_active_window_idx
  on public.booking_slot_holds (scheduled_start, scheduled_end, expires_at)
  where status in ('held', 'converting_to_checkout');

alter table public.booking_slot_holds enable row level security;

alter table public.appointments
  add column if not exists booking_session_id text,
  add column if not exists slot_hold_id uuid references public.booking_slot_holds(id) on delete set null,
  add column if not exists account_claim_status text not null default 'not_offered',
  add column if not exists account_claim_error text;

create unique index if not exists appointments_booking_session_unique_idx
  on public.appointments (booking_session_id)
  where booking_session_id is not null;

alter table public.booking_fallbacks
  add column if not exists booking_session_id text,
  add column if not exists slot_hold_id uuid references public.booking_slot_holds(id) on delete set null;

create index if not exists booking_fallbacks_booking_session_idx
  on public.booking_fallbacks (booking_session_id)
  where booking_session_id is not null;

create or replace function public.reserve_booking_slot(
  p_booking_session_id text,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_is_test boolean default false
) returns table (
  hold_id uuid,
  hold_state text,
  hold_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold public.booking_slot_holds%rowtype;
  v_now timestamptz := now();
begin
  if length(coalesce(trim(p_booking_session_id), '')) < 20
     or p_scheduled_end <= p_scheduled_start then
    return query select null::uuid, 'invalid'::text, null::timestamptz;
    return;
  end if;

  -- Serialize all reservations on the same service day. Starting-minute locks are
  -- insufficient because two different start times can overlap long services.
  perform pg_advisory_xact_lock(
    hashtext('booking-slot-day:' || to_char(p_scheduled_start at time zone 'America/Chicago', 'YYYY-MM-DD'))
  );

  update public.booking_slot_holds
  set status = 'expired', updated_at = v_now
  where status in ('held', 'converting_to_checkout')
    and expires_at <= v_now;

  if exists (
    select 1
    from public.booking_slot_holds h
    where h.booking_session_id <> p_booking_session_id
      and h.status in ('held', 'converting_to_checkout')
      and h.expires_at > v_now
      and h.is_test = false
      and p_is_test = false
      and h.scheduled_start < p_scheduled_end
      and p_scheduled_start < h.scheduled_end
  ) then
    return query select null::uuid, 'held_by_another_session'::text, null::timestamptz;
    return;
  end if;

  insert into public.booking_slot_holds (
    booking_session_id,
    scheduled_start,
    scheduled_end,
    status,
    expires_at,
    is_test,
    updated_at
  ) values (
    p_booking_session_id,
    p_scheduled_start,
    p_scheduled_end,
    'held',
    v_now + interval '15 minutes',
    p_is_test,
    v_now
  )
  on conflict (booking_session_id) do update
  set scheduled_start = excluded.scheduled_start,
      scheduled_end = excluded.scheduled_end,
      status = 'held',
      expires_at = excluded.expires_at,
      is_test = excluded.is_test,
      appointment_id = null,
      updated_at = excluded.updated_at
  returning * into v_hold;

  return query select v_hold.id, 'held_by_this_session'::text, v_hold.expires_at;
end;
$$;

revoke all on function public.reserve_booking_slot(text, timestamptz, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.reserve_booking_slot(text, timestamptz, timestamptz, boolean)
  to service_role;

insert into public.site_settings(key,value)
values (
  'migration_marker_000146',
  jsonb_build_object('name','booking_sessions_slot_holds_and_claim_status','applied',true,'version',146)
)
on conflict (key) do update set value=excluded.value, updated_at=now();

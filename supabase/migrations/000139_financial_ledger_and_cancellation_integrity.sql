-- Canonical manual-payment metadata and atomic cancellation/payment operations.
-- Payments remain the collected-money source of truth; receipts are documents.

alter table if exists public.payments
  add column if not exists reference_number text,
  add column if not exists note text,
  add column if not exists attachment_url text,
  add column if not exists receipt_requested boolean not null default false;

alter table if exists public.appointments
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancellation_refund_decision text,
  add column if not exists cancellation_customer_notification_requested boolean not null default true,
  add column if not exists cancellation_completed_at timestamptz;

create index if not exists payments_paid_reporting_idx
  on public.payments (paid_at desc, status, exclude_from_revenue, is_test);
create index if not exists appointments_finance_reporting_idx
  on public.appointments (status, job_completed_at, scheduled_start);

create or replace function public.record_manual_payment_atomic(
  p_appointment_id uuid,
  p_amount_cents integer,
  p_tip_amount_cents integer,
  p_method text,
  p_paid_at timestamptz,
  p_reference_number text,
  p_note text,
  p_attachment_url text,
  p_receipt_requested boolean,
  p_recorded_by uuid,
  p_idempotency_key text
)
returns table(payment_id uuid, balance_before_cents integer, balance_after_cents integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.appointments%rowtype;
  v_payment_id uuid;
  v_before integer;
  v_after integer;
  v_total integer;
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin')
  ) then
    raise exception 'Not authorized';
  end if;
  if coalesce(p_amount_cents, 0) < 0 or coalesce(p_tip_amount_cents, 0) < 0 then
    raise exception 'Payment and tip amounts cannot be negative';
  end if;
  v_total := coalesce(p_amount_cents, 0) + coalesce(p_tip_amount_cents, 0);
  if v_total <= 0 then raise exception 'Collected amount must be greater than zero'; end if;

  select * into v_job from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'Work order not found'; end if;
  if lower(coalesce(v_job.status, '')) in ('cancelled', 'canceled', 'voided', 'deleted', 'archived') then
    raise exception 'Cannot record payment on an inactive work order';
  end if;
  v_before := greatest(0, coalesce(v_job.balance_due_cents, 0));
  if coalesce(p_amount_cents, 0) > v_before then
    raise exception 'Payment exceeds the outstanding balance; record the difference as a tip';
  end if;
  v_after := greatest(0, v_before - coalesce(p_amount_cents, 0));

  select id into v_payment_id from public.payments where idempotency_key = p_idempotency_key limit 1;
  if v_payment_id is null then
    insert into public.payments (
      appointment_id, customer_id, amount_cents, status, payment_method,
      payment_kind, payment_choice, paid_at, tender_type, applied_amount_cents,
      tip_amount_cents, idempotency_key, recorded_by, reference_number, note,
      attachment_url, receipt_requested, metadata
    ) values (
      p_appointment_id, v_job.customer_id, v_total, 'succeeded', lower(coalesce(p_method, 'other')),
      'manual', 'balance', coalesce(p_paid_at, now()), lower(coalesce(p_method, 'other')),
      coalesce(p_amount_cents, 0), coalesce(p_tip_amount_cents, 0), p_idempotency_key,
      p_recorded_by, nullif(trim(p_reference_number), ''), nullif(trim(p_note), ''),
      nullif(trim(p_attachment_url), ''), coalesce(p_receipt_requested, false),
      jsonb_build_object('source', 'admin_manual', 'recorded_by', p_recorded_by)
    ) returning id into v_payment_id;

    update public.appointments
    set balance_due_cents = v_after,
        payment_status = case when v_after = 0 then 'paid' else 'balance_due' end,
        updated_at = now()
    where id = p_appointment_id;
  end if;

  return query select v_payment_id, v_before, v_after;
end;
$$;

revoke all on function public.record_manual_payment_atomic(uuid, integer, integer, text, timestamptz, text, text, text, boolean, uuid, text) from public;
grant execute on function public.record_manual_payment_atomic(uuid, integer, integer, text, timestamptz, text, text, text, boolean, uuid, text) to authenticated, service_role;

create or replace function public.cancel_appointment_atomic(
  p_appointment_id uuid,
  p_reason text,
  p_actor_id uuid,
  p_refund_decision text,
  p_notify_customer boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.appointments%rowtype;
  v_now timestamptz := now();
  v_from text;
  v_collected integer := 0;
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin')
  ) then
    raise exception 'Not authorized';
  end if;

  select * into v_job from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'Appointment not found'; end if;
  v_from := coalesce(v_job.lifecycle_stage, v_job.status, 'scheduled');
  select coalesce(sum(greatest(0, coalesce(amount_cents, 0) - coalesce(refunded_amount_cents, 0))), 0)::integer
    into v_collected
    from public.payments
    where appointment_id = p_appointment_id
      and lower(coalesce(status, '')) in ('paid', 'succeeded')
      and coalesce(exclude_from_revenue, false) is false
      and voided_at is null;

  update public.appointments
  set status = 'cancelled', lifecycle_stage = 'cancelled', cancelled_at = coalesce(cancelled_at, v_now),
      cancel_reason = coalesce(nullif(trim(p_reason), ''), 'Cancelled'),
      cancellation_reason = coalesce(nullif(trim(p_reason), ''), 'Cancelled'),
      cancelled_by = p_actor_id,
      cancellation_refund_decision = coalesce(nullif(trim(p_refund_decision), ''), case when v_collected > 0 then 'review_required' else 'no_payment' end),
      cancellation_customer_notification_requested = coalesce(p_notify_customer, true),
      cancellation_completed_at = v_now,
      updated_at = v_now
  where id = p_appointment_id;

  update public.scheduled_messages
  set status = 'canceled', skipped_reason = 'appointment_cancelled', updated_at = v_now
  where appointment_id = p_appointment_id and lower(coalesce(status, '')) in ('queued', 'scheduled', 'pending');

  delete from public.booking_availability_blocks where appointment_id = p_appointment_id;

  if v_from <> 'cancelled' and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'work_order_transition_events') then
    insert into public.work_order_transition_events (appointment_id, from_stage, to_stage, actor_id, reason, admin_override)
    values (p_appointment_id, v_from, 'cancelled', p_actor_id, coalesce(nullif(trim(p_reason), ''), 'Cancelled'), true);
  end if;

  return jsonb_build_object(
    'appointment_id', p_appointment_id,
    'previous_status', v_from,
    'collected_cents', v_collected,
    'refund_decision', coalesce(nullif(trim(p_refund_decision), ''), case when v_collected > 0 then 'review_required' else 'no_payment' end),
    'cancelled_at', v_now
  );
end;
$$;

revoke all on function public.cancel_appointment_atomic(uuid, text, uuid, text, boolean) from public;
grant execute on function public.cancel_appointment_atomic(uuid, text, uuid, text, boolean) to authenticated, service_role;

insert into public.site_settings (key, value)
values ('migration_marker_000139', jsonb_build_object('name', 'financial_ledger_and_cancellation_integrity', 'applied', true, 'version', 139))
on conflict (key) do update set value = excluded.value, updated_at = now();

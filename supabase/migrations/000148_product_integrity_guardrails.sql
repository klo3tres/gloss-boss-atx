-- Backside integrity rules: a closed work order can never remain an actionable receivable.

create or replace function public.enforce_terminal_appointment_financial_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(coalesce(new.status, '')) in ('cancelled', 'canceled', 'voided', 'deleted')
     or new.deleted_at is not null then
    new.balance_due_cents := 0;
    if lower(coalesce(new.payment_status, '')) not in (
      'paid', 'paid_in_full', 'refunded', 'partially_refunded'
    ) then
      new.payment_status := 'cancelled';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_terminal_financial_guard on public.appointments;
create trigger appointments_terminal_financial_guard
before insert or update of status, deleted_at, balance_due_cents, payment_status
on public.appointments
for each row
execute function public.enforce_terminal_appointment_financial_state();

update public.appointments
set balance_due_cents = 0,
    payment_status = case
      when lower(coalesce(payment_status, '')) in ('paid', 'paid_in_full', 'refunded', 'partially_refunded')
        then payment_status
      else 'cancelled'
    end,
    updated_at = now()
where (
    lower(coalesce(status, '')) in ('cancelled', 'canceled', 'voided', 'deleted')
    or deleted_at is not null
  )
  and (
    coalesce(balance_due_cents, 0) <> 0
    or lower(coalesce(payment_status, '')) not in ('paid', 'paid_in_full', 'refunded', 'partially_refunded', 'cancelled')
  );

insert into public.site_settings (key, value)
values (
  'appointment_notification_policy',
  jsonb_build_object(
    'enabled', true,
    'acknowledgeMinutesBefore', 60,
    'onWayMinutesBefore', 30,
    'firstLateMinutes', 15,
    'secondLateMinutes', 30,
    'overrunGraceMinutes', 15,
    'cooldownMinutes', 30,
    'maximumSendsPerRule', 1
  )
)
on conflict (key) do nothing;

insert into public.site_settings (key, value)
values (
  'migration_marker_000148',
  jsonb_build_object('name', 'product_integrity_guardrails', 'applied', true, 'version', 148)
)
on conflict (key) do update set value = excluded.value, updated_at = now();

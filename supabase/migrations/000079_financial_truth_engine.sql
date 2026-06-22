-- Financial truth engine: payments are money; receipts are documents.
alter table if exists public.payments
  add column if not exists tender_type text,
  add column if not exists applied_amount_cents integer,
  add column if not exists tip_amount_cents integer not null default 0,
  add column if not exists idempotency_key text,
  add column if not exists source_event_id text,
  add column if not exists recorded_by uuid references public.profiles(id) on delete set null;

update public.payments
set tender_type = case
    when lower(coalesce(payment_method, payment_kind, '')) like '%stripe%' then 'stripe'
    when lower(coalesce(payment_method, payment_kind, '')) like '%cash%' then 'cash'
    when lower(coalesce(payment_method, payment_kind, '')) like '%zelle%' then 'zelle'
    when lower(coalesce(payment_method, payment_kind, '')) like '%venmo%' then 'venmo'
    when lower(coalesce(payment_method, payment_kind, '')) like '%check%' then 'check'
    when lower(coalesce(payment_method, payment_kind, '')) like '%credit%' then 'customer_credit'
    else 'other'
  end
where tender_type is null;

update public.payments
set applied_amount_cents = greatest(0, coalesce(amount_cents, 0) - coalesce(tip_amount_cents, 0))
where applied_amount_cents is null;

create unique index if not exists idx_payments_active_stripe_intent_unique
  on public.payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null and coalesce(exclude_from_revenue, false) = false
    and voided_at is null and lower(coalesce(status, '')) in ('succeeded', 'paid');
create unique index if not exists idx_payments_active_stripe_charge_unique
  on public.payments (stripe_charge_id)
  where stripe_charge_id is not null and coalesce(exclude_from_revenue, false) = false
    and voided_at is null and lower(coalesce(status, '')) in ('succeeded', 'paid');
create unique index if not exists idx_payments_idempotency_unique
  on public.payments (idempotency_key) where idempotency_key is not null;
create index if not exists idx_payments_work_order_truth
  on public.payments (appointment_id, status, exclude_from_revenue, paid_at desc);

alter table if exists public.receipts
  add column if not exists is_canonical boolean not null default false,
  add column if not exists document_version integer not null default 1,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by uuid references public.receipts(id) on delete set null;
create unique index if not exists idx_receipts_one_canonical_appointment
  on public.receipts (appointment_id) where appointment_id is not null and is_canonical = true and superseded_at is null;
create unique index if not exists idx_receipts_one_canonical_fallback
  on public.receipts (fallback_booking_id) where fallback_booking_id is not null and is_canonical = true and superseded_at is null;

create table if not exists public.payment_audit_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  before_row jsonb,
  after_row jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_payment_audit_payment_date on public.payment_audit_events(payment_id, created_at desc);

create or replace function public.audit_payment_truth_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.payment_audit_events(payment_id, appointment_id, actor_id, action, after_row)
    values (new.id, new.appointment_id, auth.uid(), 'created', to_jsonb(new));
  elsif old.status is distinct from new.status or old.amount_cents is distinct from new.amount_cents
    or old.appointment_id is distinct from new.appointment_id
    or old.exclude_from_revenue is distinct from new.exclude_from_revenue
    or old.voided_at is distinct from new.voided_at then
    insert into public.payment_audit_events(payment_id, appointment_id, actor_id, action, before_row, after_row, reason)
    values (new.id, new.appointment_id, auth.uid(), 'changed', to_jsonb(old), to_jsonb(new),
      coalesce(new.metadata->>'void_reason', new.metadata->>'reason'));
  end if;
  return new;
end; $$;
drop trigger if exists trg_audit_payment_truth_change on public.payments;
create trigger trg_audit_payment_truth_change after insert or update on public.payments
for each row execute function public.audit_payment_truth_change();

alter table public.payment_audit_events enable row level security;
drop policy if exists payment_audit_staff_read on public.payment_audit_events;
create policy payment_audit_staff_read on public.payment_audit_events for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin'))
);

comment on table public.payments is 'Canonical collected-money ledger. Split tenders are separate rows; receipts never create revenue.';
comment on column public.payments.applied_amount_cents is 'Amount applied to the work-order balance.';
comment on column public.payments.tip_amount_cents is 'Collected amount intentionally above the work-order balance.';
comment on table public.receipts is 'Document snapshots generated from canonical payments; never an independent revenue source.';

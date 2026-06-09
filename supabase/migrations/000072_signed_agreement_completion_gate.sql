-- Align completion enforcement with all durable agreement stores.
-- No data is dropped. This only broadens the "signed" check used by the
-- appointment completion trigger and technician update policy.

create or replace function public.gb_has_completed_agreement_for_appointment(p_appointment_id uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  has_row boolean := false;
begin
  if p_appointment_id is null then
    return false;
  end if;

  if to_regclass('public.signed_agreements') is not null then
    execute $q$
      select exists (
        select 1
        from public.signed_agreements
        where appointment_id = $1
      )
    $q$ into has_row using p_appointment_id;
    if has_row then
      return true;
    end if;
  end if;

  if to_regclass('public.job_agreements') is not null then
    execute $q$
      select exists (
        select 1
        from public.job_agreements
        where appointment_id = $1
      )
    $q$ into has_row using p_appointment_id;
    if has_row then
      return true;
    end if;
  end if;

  if to_regclass('public.intake_submissions') is not null then
    execute $q$
      select exists (
        select 1
        from public.intake_submissions
        where appointment_id = $1
      )
    $q$ into has_row using p_appointment_id;
    if has_row then
      return true;
    end if;
  end if;

  return false;
end;
$$;

create or replace function public.enforce_signed_before_completed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'completed'
    and (tg_op = 'INSERT' or old.status is distinct from 'completed')
    and not public.gb_has_completed_agreement_for_appointment(new.id)
  then
    raise exception 'Appointment cannot be set to completed without a signed agreement';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_require_signature_before_completed on public.appointments;
create trigger appointments_require_signature_before_completed
  before insert or update of status on public.appointments
  for each row
  when (new.status = 'completed')
  execute function public.enforce_signed_before_completed();

drop policy if exists "appointments_tech_update" on public.appointments;
create policy "appointments_tech_update" on public.appointments
  for update using (
    public.current_role()::text = 'technician'
    and assigned_technician_id = auth.uid()
  ) with check (
    public.current_role()::text = 'technician'
    and assigned_technician_id = auth.uid()
    and (
      status is distinct from 'completed'
      or public.gb_has_completed_agreement_for_appointment(id)
    )
  );

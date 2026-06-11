-- Update enforce_signed_before_completed to check signed_agreements, job_agreements, and intake_submissions.
create or replace function public.enforce_signed_before_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_signed boolean := false;
  intake_val jsonb;
  form_ack jsonb;
begin
  if new.status = 'completed' then
    -- 1. Check signed_agreements
    if exists (
      select 1 from public.signed_agreements sa 
      where sa.appointment_id = new.id
    ) then
      is_signed := true;
    end if;

    -- 2. Check job_agreements
    if not is_signed and exists (
      select 1 from public.job_agreements ja 
      where ja.appointment_id = new.id
    ) then
      is_signed := true;
    end if;

    -- 3. Check intake_submissions
    if not is_signed then
      select form_data into intake_val from public.intake_submissions where appointment_id = new.id limit 1;
      if intake_val is not null then
        form_ack := intake_val->'walk_in_legal_ack';
        if (form_ack->>'signer_legal_name' is not null and trim(form_ack->>'signer_legal_name') <> '') 
           or (intake_val->>'agreement_snapshot' is not null and trim(intake_val->>'agreement_snapshot') <> '') then
          is_signed := true;
        end if;
      end if;
    end if;

    if not is_signed then
      raise exception 'Appointment cannot be set to completed without a signed agreement (Appointment ID: %, Customer ID: %)', 
        new.id, coalesce(new.customer_id::text, 'None');
    end if;
  end if;
  return new;
end;
$$;

-- Controlled customer-flow QA records. These records are excluded from normal
-- revenue, automation, reminders, campaigns, and customer communications.

alter table public.appointments
  add column if not exists qa_source_appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists qa_expires_at timestamptz,
  add column if not exists exclude_from_automations boolean not null default false,
  add column if not exists exclude_from_customer_communications boolean not null default false;

create index if not exists appointments_qa_clone_idx
  on public.appointments (is_test, qa_expires_at)
  where is_test = true;

insert into public.site_settings(key,value)
values ('migration_marker_000144', jsonb_build_object('name','customer_preview_qa_clones','applied',true,'version',144))
on conflict (key) do update set value=excluded.value, updated_at=now();

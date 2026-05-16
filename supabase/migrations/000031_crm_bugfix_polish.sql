-- CRM bugfix + polish (additive only, idempotent).
-- Hardens schema drift around agreements, job notes, fallbacks, messages, customers.

-- ---------- Agreements: snapshot columns ----------
alter table public.signed_agreements add column if not exists agreement_snapshot text;
alter table public.job_agreements add column if not exists agreement_snapshot text;

-- ---------- Intake: optional legal ack backup (walk-in / drift fallback) ----------
alter table public.intake_submissions add column if not exists agreement_snapshot text;

-- ---------- Field notes: categories ----------
alter table public.tech_job_notes add column if not exists internal_notes text;
alter table public.tech_job_notes add column if not exists damage_notes text;
alter table public.tech_job_notes add column if not exists customer_visible boolean not null default false;

-- ---------- Fallback queue lifecycle ----------
alter table public.booking_fallbacks add column if not exists reviewed_at timestamptz;
alter table public.booking_fallbacks add column if not exists archived_at timestamptz;
alter table public.booking_fallbacks add column if not exists expires_at timestamptz;
alter table public.booking_fallbacks add column if not exists last_failure_detail text;

-- ---------- Message center tracking ----------
alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages add column if not exists replied_at timestamptz;
alter table public.messages add column if not exists archived_at timestamptz;

-- ---------- Customer directory ----------
alter table public.customers add column if not exists archived boolean not null default false;
alter table public.customers add column if not exists archived_at timestamptz;

-- ---------- Staff can read all field notes (dispatch / CRM); techs still own writes ----------
drop policy if exists tech_job_notes_staff_select on public.tech_job_notes;
create policy tech_job_notes_staff_select
  on public.tech_job_notes
  for select
  using (public.is_staff());

notify pgrst, 'reload schema';

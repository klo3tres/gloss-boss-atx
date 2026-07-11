-- Target the technician dashboard's two highest-frequency filtered reads.
-- These indexes do not alter RLS or application data.
create index if not exists idx_tech_job_timers_open_by_technician
  on public.tech_job_timers (technician_id, started_at desc)
  where ended_at is null;

create index if not exists idx_appointments_tech_completed_recent
  on public.appointments (assigned_technician_id, job_completed_at desc)
  where status = 'completed';

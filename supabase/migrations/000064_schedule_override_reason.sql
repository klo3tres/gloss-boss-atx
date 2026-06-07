-- Schedule override audit reason (admin reschedule with conflict override)

alter table public.appointments add column if not exists schedule_override_reason text;
alter table public.booking_fallbacks add column if not exists schedule_override_reason text;

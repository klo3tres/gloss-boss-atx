-- Gloss Boss ATX — operations reality fix (additive only)

alter table public.appointments add column if not exists service_location_type text;
alter table public.appointments add column if not exists water_access text;
alter table public.appointments add column if not exists power_access text;
alter table public.appointments add column if not exists parking_access text;
alter table public.appointments add column if not exists gate_access_notes text;
alter table public.appointments add column if not exists estimated_duration_minutes integer;
alter table public.appointments add column if not exists estimated_end timestamptz;
alter table public.appointments add column if not exists schedule_override boolean default false;

alter table public.booking_fallbacks add column if not exists service_location_type text;
alter table public.booking_fallbacks add column if not exists water_access text;
alter table public.booking_fallbacks add column if not exists power_access text;
alter table public.booking_fallbacks add column if not exists parking_access text;
alter table public.booking_fallbacks add column if not exists gate_access_notes text;
alter table public.booking_fallbacks add column if not exists estimated_duration_minutes integer;
alter table public.booking_fallbacks add column if not exists estimated_end timestamptz;
alter table public.booking_fallbacks add column if not exists schedule_override boolean default false;

alter table public.customers add column if not exists service_location_type text;
alter table public.customers add column if not exists water_access text;
alter table public.customers add column if not exists power_access text;
alter table public.customers add column if not exists parking_access text;
alter table public.customers add column if not exists gate_access_notes text;

alter table public.job_media add column if not exists thumbnail_url text;
alter table public.job_media add column if not exists thumbnail_path text;
alter table public.job_photos add column if not exists thumbnail_url text;
alter table public.job_photos add column if not exists thumbnail_path text;

alter table public.messages add column if not exists customer_id uuid;
alter table public.messages add column if not exists thread_id uuid;
alter table public.messages add column if not exists direction text default 'inbound';
alter table public.messages add column if not exists admin_reply text;
alter table public.messages add column if not exists replied_at timestamptz;
alter table public.messages add column if not exists replied_by uuid;

create index if not exists idx_appointments_scheduled_start on public.appointments(scheduled_start);
create index if not exists idx_appointments_estimated_end on public.appointments(estimated_end);
create index if not exists idx_messages_customer_thread on public.messages(customer_id, created_at desc);

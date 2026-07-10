-- Staff (technician/admin) notification preferences + optional per-user Pushover key

alter table public.profiles
  add column if not exists staff_notification_preferences jsonb not null default '{
    "notify_email_enabled": true,
    "notify_sms_enabled": true,
    "notify_push_enabled": true,
    "notify_in_app_enabled": true,
    "notify_job_assigned": true,
    "notify_job_rescheduled": true,
    "notify_job_cancelled": true,
    "notify_new_booking_assigned": true,
    "quiet_hours_start": null,
    "quiet_hours_end": null
  }'::jsonb;

alter table public.profiles
  add column if not exists pushover_user_key text;

comment on column public.profiles.staff_notification_preferences is 'Per-staff alert channel + event toggles (email, SMS, web push, in-app).';
comment on column public.profiles.pushover_user_key is 'Optional Pushover user key for phone push alerts (staff installs Pushover app).';

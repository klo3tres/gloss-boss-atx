-- One durable late-start alert per appointment. Closed jobs remain unaffected.
create unique index if not exists scheduled_messages_job_start_overdue_uidx
  on public.scheduled_messages (appointment_id, rule_key)
  where rule_key = 'job_start_overdue_15m' and appointment_id is not null;

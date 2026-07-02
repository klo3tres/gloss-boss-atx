-- Customer portal secure access + RLS fallback for linked accounts

alter table public.appointments
  add column if not exists portal_access_expires_at timestamptz;

comment on column public.appointments.portal_access_expires_at is
  'Optional expiry for customer portal magic links; null = no expiry check.';

-- Allow customers to read appointments tied to their auth account OR matching guest email
drop policy if exists "appointments_customer_select" on public.appointments;
create policy "appointments_customer_select" on public.appointments
  for select using (
    created_by = auth.uid()
    or exists (
      select 1 from public.customers c
      where c.id = appointments.customer_id and c.auth_user_id = auth.uid()
    )
    or (
      guest_email is not null
      and lower(guest_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- job_timeline_events: customer read via appointment access
drop policy if exists "job_timeline_events_customer_read" on public.job_timeline_events;
create policy "job_timeline_events_customer_read" on public.job_timeline_events
  for select using (
    exists (
      select 1 from public.appointments a
      where a.id = job_timeline_events.appointment_id
        and (
          a.created_by = auth.uid()
          or exists (
            select 1 from public.customers c
            where c.id = a.customer_id and c.auth_user_id = auth.uid()
          )
          or (
            a.guest_email is not null
            and lower(a.guest_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
        )
    )
  );

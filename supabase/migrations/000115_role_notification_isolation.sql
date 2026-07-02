-- Role-scoped notification and timeline reads (technicians + customers must not see global owner feed)

drop policy if exists job_timeline_staff on public.job_timeline_events;
drop policy if exists job_timeline_customer_read on public.job_timeline_events;
drop policy if exists "job_timeline_events_customer_read" on public.job_timeline_events;

create policy job_timeline_staff_write on public.job_timeline_events
  for insert with check (public.is_staff());

create policy job_timeline_staff_update on public.job_timeline_events
  for update using (public.is_staff()) with check (public.is_staff());

create policy job_timeline_select_scoped on public.job_timeline_events
  for select using (
    public.is_admin_level()
    OR (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'technician'
      )
      AND exists (
        select 1 from public.appointments a
        where a.id = job_timeline_events.appointment_id
          and a.assigned_technician_id = auth.uid()
      )
    )
    OR exists (
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

drop policy if exists titan_notification_events_staff on public.titan_notification_events;

create policy titan_notification_events_admin on public.titan_notification_events
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );

create policy titan_notification_events_tech_read on public.titan_notification_events
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'technician'
    )
    AND (
      related_type is distinct from 'appointment'
      OR related_id is null
      OR exists (
        select 1 from public.appointments a
        where a.id::text = titan_notification_events.related_id
          and a.assigned_technician_id = auth.uid()
      )
    )
  );

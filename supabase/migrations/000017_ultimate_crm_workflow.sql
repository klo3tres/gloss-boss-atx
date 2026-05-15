-- Ultimate CRM workflow pass: workflow tables, intake extensions, job photos parallel, goals, notes, review settings
-- Idempotent only: create if not exists / add column if not exists. No destructive drops of data.

-- ---------- Profiles / customers ----------
alter table public.profiles add column if not exists display_name text;

alter table public.customers add column if not exists address_line1 text;
alter table public.customers add column if not exists address_line2 text;
alter table public.customers add column if not exists city text;
alter table public.customers add column if not exists state text;
alter table public.customers add column if not exists postal_code text;

-- ---------- Leads follow-up ----------
alter table public.leads add column if not exists last_contacted_at timestamptz;
alter table public.leads add column if not exists next_follow_up_at timestamptz;

-- ---------- job_media: damage category + CRM links ----------
alter table public.job_media add column if not exists customer_id uuid references public.customers (id) on delete set null;
alter table public.job_media add column if not exists vehicle_id uuid references public.vehicles (id) on delete set null;

alter table public.job_media drop constraint if exists job_media_category_check;
alter table public.job_media add constraint job_media_category_check
  check (category in ('inspection', 'before', 'after', 'damage', 'other'));

-- ---------- Structured job_photos (parallel to job_media for future-first APIs) ----------
create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  technician_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('before', 'after', 'inspection', 'damage')),
  storage_url text not null,
  notes text,
  publish_to_gallery boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_photos_appt on public.job_photos (appointment_id, kind, created_at desc);

alter table public.job_photos enable row level security;

drop policy if exists job_photos_staff on public.job_photos;
create policy job_photos_staff on public.job_photos
  for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists job_photos_customer_read on public.job_photos;
create policy job_photos_customer_read on public.job_photos
  for select
  using (
    exists (
      select 1 from public.appointments a
      where a.id = job_photos.appointment_id
        and (
          a.created_by = auth.uid()
          or exists (
            select 1 from public.customers c
            where c.id = a.customer_id and c.auth_user_id = auth.uid()
          )
        )
    )
  );

-- ---------- Checklists + status timeline ----------
create table if not exists public.job_checklists (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_job_checklists_one_per_appt on public.job_checklists (appointment_id);

alter table public.job_checklists enable row level security;

drop policy if exists job_checklists_staff on public.job_checklists;
create policy job_checklists_staff on public.job_checklists
  for all
  using (public.is_staff())
  with check (public.is_staff());

create table if not exists public.job_status_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references auth.users (id) on delete set null,
  note text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_status_events_appt on public.job_status_events (appointment_id, created_at desc);

alter table public.job_status_events enable row level security;

drop policy if exists job_status_events_staff on public.job_status_events;
create policy job_status_events_staff on public.job_status_events
  for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists job_status_events_customer_read on public.job_status_events;
create policy job_status_events_customer_read on public.job_status_events
  for select
  using (
    exists (
      select 1 from public.appointments a
      where a.id = job_status_events.appointment_id
        and (
          a.created_by = auth.uid()
          or exists (
            select 1 from public.customers c
            where c.id = a.customer_id and c.auth_user_id = auth.uid()
          )
        )
    )
  );

-- ---------- Intake submissions (production fields) ----------
alter table public.intake_submissions add column if not exists customer_id uuid references public.customers (id) on delete set null;
alter table public.intake_submissions add column if not exists vehicle_id uuid references public.vehicles (id) on delete set null;
alter table public.intake_submissions add column if not exists technician_id uuid references auth.users (id) on delete set null;
alter table public.intake_submissions add column if not exists signature text;
alter table public.intake_submissions add column if not exists signed_at timestamptz;
alter table public.intake_submissions add column if not exists client_meta jsonb not null default '{}'::jsonb;

-- ---------- Technician goals ----------
create table if not exists public.technician_goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  goal_key text not null,
  label text not null default '',
  target_cents int not null default 0,
  period text not null default 'week' check (period in ('day', 'week', 'month')),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (profile_id, goal_key)
);

alter table public.technician_goals enable row level security;

drop policy if exists technician_goals_staff on public.technician_goals;
create policy technician_goals_staff on public.technician_goals
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- Customer CRM notes ----------
create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  body text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_notes_customer on public.customer_notes (customer_id, created_at desc);

alter table public.customer_notes enable row level security;

drop policy if exists customer_notes_staff on public.customer_notes;
create policy customer_notes_staff on public.customer_notes
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin', 'technician')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin', 'technician')
    )
  );

-- ---------- Review / Google settings (CMS key-value) ----------
create table if not exists public.review_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.review_settings enable row level security;

drop policy if exists review_settings_public_read on public.review_settings;
create policy review_settings_public_read on public.review_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists review_settings_admin_write on public.review_settings;
create policy review_settings_admin_write on public.review_settings
  for all
  using (public.is_admin_level())
  with check (public.is_admin_level());

insert into public.review_settings (key, value)
values ('google_business', '{"review_url": ""}'::jsonb)
on conflict (key) do nothing;

notify pgrst, 'reload schema';

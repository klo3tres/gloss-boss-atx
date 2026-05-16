-- Field workflow + CRM polish (safe additive only).

-- ---------- job_media: upload/storage metadata + fine-grain categories ----------
-- ---------- Agreements: SMS service update consent ----------
alter table public.signed_agreements add column if not exists sms_consent boolean not null default false;
alter table public.signed_agreements add column if not exists sms_consent_text text;
alter table public.job_agreements add column if not exists sms_consent boolean not null default false;
alter table public.job_agreements add column if not exists sms_consent_text text;

alter table public.job_media add column if not exists storage_bucket text;
alter table public.job_media add column if not exists storage_path text;
alter table public.job_media add column if not exists file_path text;
alter table public.job_media add column if not exists mime_type text;
alter table public.job_media add column if not exists content_type text;
alter table public.job_media add column if not exists file_size_bytes bigint;
alter table public.job_media add column if not exists file_size bigint;
alter table public.job_media add column if not exists photo_category text;
alter table public.job_media add column if not exists technician_id uuid references public.profiles (id) on delete set null;
alter table public.job_media add column if not exists customer_id uuid references public.customers (id) on delete set null;
alter table public.job_media add column if not exists vehicle_id uuid references public.vehicles (id) on delete set null;
alter table public.job_media add column if not exists fallback_booking_id uuid references public.booking_fallbacks (id) on delete set null;
alter table public.job_media add column if not exists approved_for_customer boolean not null default false;
alter table public.job_media add column if not exists publish_to_gallery boolean not null default false;
alter table public.job_media add column if not exists published_to_gallery boolean not null default false;
alter table public.job_media add column if not exists media_url text;
alter table public.job_media add column if not exists public_url text;
alter table public.job_media add column if not exists customer_safe_caption text;

-- Parallel structured photo table for fallback/job uploads where job_media constraints vary.
create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments (id) on delete cascade,
  fallback_booking_id uuid references public.booking_fallbacks (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  technician_id uuid references public.profiles (id) on delete set null,
  category text not null default 'inspection',
  photo_category text,
  storage_bucket text,
  storage_path text,
  file_path text,
  file_url text not null,
  media_url text,
  public_url text,
  mime_type text,
  content_type text,
  file_size_bytes bigint,
  file_size bigint,
  notes text,
  approved_for_customer boolean not null default false,
  publish_to_gallery boolean not null default false,
  published_to_gallery boolean not null default false,
  customer_safe_caption text,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_photos_appt_category on public.job_photos (appointment_id, category, created_at desc);
create index if not exists idx_job_photos_fallback on public.job_photos (fallback_booking_id, created_at desc);
create index if not exists idx_job_photos_customer on public.job_photos (customer_id, created_at desc);

alter table public.job_photos enable row level security;

drop policy if exists job_photos_staff_all_032 on public.job_photos;
create policy job_photos_staff_all_032 on public.job_photos
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists job_photos_customer_visible_032 on public.job_photos;
create policy job_photos_customer_visible_032 on public.job_photos
  for select using (
    coalesce(approved_for_customer, false) = true
    and exists (
      select 1 from public.appointments a
      inner join public.customers c on c.id = a.customer_id
      where a.id = job_photos.appointment_id
        and c.auth_user_id = auth.uid()
    )
  );

-- ---------- notes/timers linked to appointments and fallbacks ----------
alter table public.tech_job_notes add column if not exists appointment_id uuid references public.appointments (id) on delete set null;
alter table public.tech_job_notes add column if not exists fallback_booking_id uuid references public.booking_fallbacks (id) on delete set null;
alter table public.tech_job_notes add column if not exists internal_notes text;
alter table public.tech_job_notes add column if not exists damage_notes text;
alter table public.tech_job_notes add column if not exists customer_visible boolean not null default false;

alter table public.tech_job_timers add column if not exists appointment_id uuid references public.appointments (id) on delete set null;
alter table public.tech_job_timers add column if not exists fallback_booking_id uuid references public.booking_fallbacks (id) on delete set null;

-- ---------- business/technician goals ----------
create table if not exists public.business_goals (
  id uuid primary key default gen_random_uuid(),
  goal_key text not null unique,
  target_cents int,
  target_count int,
  period text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.technician_goals (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid references public.profiles (id) on delete cascade,
  goal_key text not null,
  target_cents int,
  target_count int,
  period text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_technician_goals_tech_active on public.technician_goals (technician_id, active);

alter table public.business_goals enable row level security;
alter table public.technician_goals enable row level security;

drop policy if exists business_goals_staff_032 on public.business_goals;
create policy business_goals_staff_032 on public.business_goals
  for all using (public.is_admin_level()) with check (public.is_admin_level());

drop policy if exists technician_goals_staff_032 on public.technician_goals;
create policy technician_goals_staff_032 on public.technician_goals
  for all using (public.is_admin_level()) with check (public.is_admin_level());

drop policy if exists technician_goals_own_read_032 on public.technician_goals;
create policy technician_goals_own_read_032 on public.technician_goals
  for select using (technician_id = auth.uid() or public.is_admin_level());

-- ---------- payments/receipts visibility fields ----------
alter table public.payments add column if not exists customer_id uuid references public.customers (id) on delete set null;
alter table public.payments add column if not exists service_slug text;
alter table public.payments add column if not exists receipt_url text;
alter table public.payments add column if not exists payment_kind text;

-- ---------- fallback lifecycle ----------
alter table public.booking_fallbacks add column if not exists expires_at timestamptz;
alter table public.booking_fallbacks add column if not exists archived_at timestamptz;
alter table public.booking_fallbacks add column if not exists reviewed_at timestamptz;
alter table public.booking_fallbacks add column if not exists assigned_technician_id uuid references public.profiles (id) on delete set null;

-- ---------- service pricing quote support + team active flag ----------
alter table public.service_prices add column if not exists quote_only boolean not null default false;
alter table public.profiles add column if not exists active boolean not null default true;

notify pgrst, 'reload schema';

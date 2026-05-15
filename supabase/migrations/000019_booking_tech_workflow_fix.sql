-- Safe additive migration: booking reliability, add-ons, offers slugs, CRM extensions, notifications placeholder.

-- ---------- Add-ons catalog (idempotent) ----------
create table if not exists public.addons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  price_cents int not null default 0,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.addons enable row level security;

drop policy if exists "addons_public_read" on public.addons;
create policy "addons_public_read"
  on public.addons for select
  to anon, authenticated
  using (active = true);

drop policy if exists "addons_admin_all" on public.addons;
create policy "addons_admin_all"
  on public.addons for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin'::public.app_role, 'super_admin'::public.app_role)
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin'::public.app_role, 'super_admin'::public.app_role)
    )
  );

insert into public.addons (slug, label, price_cents, active, sort_order)
values
  ('engine_bay', 'Engine bay detail', 2500, true, 10),
  ('pet_hair', 'Pet hair removal', 3500, true, 20),
  ('odor', 'Odor treatment', 4000, true, 30),
  ('clay_bar', 'Clay bar treatment', 5000, true, 40)
on conflict (slug) do nothing;

-- ---------- Offers: public slug for /book?offer= ----------
alter table public.offers add column if not exists slug text;

create unique index if not exists offers_slug_unique on public.offers (slug)
  where slug is not null and btrim(slug) <> '';

update public.offers o
set slug = 'offer-' || substring(replace(o.id::text, '-', ''), 1, 16)
where o.slug is null or btrim(o.slug) = '';

-- ---------- Messages: resilient sender columns ----------
alter table public.messages add column if not exists from_name text;
alter table public.messages add column if not exists from_email text;
alter table public.messages add column if not exists from_phone text;

-- ---------- Customers: address for CRM / field ----------
alter table public.customers add column if not exists address text;

-- ---------- Job media: richer audit trail ----------
alter table public.job_media add column if not exists customer_id uuid references public.customers (id) on delete set null;
alter table public.job_media add column if not exists vehicle_id uuid references public.vehicles (id) on delete set null;
alter table public.job_media add column if not exists technician_id uuid references public.profiles (id) on delete set null;
alter table public.job_media add column if not exists visible_to_customer boolean not null default false;
alter table public.job_media add column if not exists customer_safe_caption text;

-- Expand category check to include damage (additive: drop/recreate constraint safely)
alter table public.job_media drop constraint if exists job_media_category_check;
alter table public.job_media add constraint job_media_category_check
  check (category in ('inspection', 'before', 'after', 'damage', 'other'));

-- ---------- Job timeline / status events ----------
create table if not exists public.job_timeline_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  event_type text not null,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_timeline_appt on public.job_timeline_events (appointment_id, created_at desc);

alter table public.job_timeline_events enable row level security;

drop policy if exists job_timeline_staff on public.job_timeline_events;
create policy job_timeline_staff on public.job_timeline_events
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- Notification outbox (email/SMS hooks; workers optional) ----------
create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_notification_outbox_pending on public.notification_outbox (status, created_at);

alter table public.notification_outbox enable row level security;

drop policy if exists notification_outbox_staff on public.notification_outbox;
-- No anon access; staff read placeholder
create policy notification_outbox_staff on public.notification_outbox
  for select
  using (public.is_admin_level());

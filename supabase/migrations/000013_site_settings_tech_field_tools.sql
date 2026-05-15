-- Site branding (navbar logo URL) + technician field tools (timers, notes).
-- Idempotent; safe to re-run.

-- ---------- site_settings (marketing KV; separate from Stripe `settings` table) ----------
create table if not exists public.site_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "site_settings_public_read_navbar_logo" on public.site_settings;
create policy "site_settings_public_read_navbar_logo"
  on public.site_settings
  for select
  to anon, authenticated
  using (key = 'navbar_logo');

drop policy if exists "site_settings_staff_all" on public.site_settings;
create policy "site_settings_staff_all"
  on public.site_settings
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- tech_job_timers ----------
create table if not exists public.tech_job_timers (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,
  label text,
  created_at timestamptz not null default now()
);

alter table public.tech_job_timers enable row level security;

drop policy if exists "tech_job_timers_own" on public.tech_job_timers;
create policy "tech_job_timers_own"
  on public.tech_job_timers
  for all
  using (technician_id = auth.uid())
  with check (technician_id = auth.uid());

-- ---------- tech_job_notes ----------
create table if not exists public.tech_job_notes (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references auth.users (id) on delete cascade,
  checklist jsonb not null default '[]'::jsonb,
  before_notes text,
  after_notes text,
  upsell_suggestions text,
  created_at timestamptz not null default now()
);

alter table public.tech_job_notes enable row level security;

drop policy if exists "tech_job_notes_own" on public.tech_job_notes;
create policy "tech_job_notes_own"
  on public.tech_job_notes
  for all
  using (technician_id = auth.uid())
  with check (technician_id = auth.uid());

notify pgrst, 'reload schema';

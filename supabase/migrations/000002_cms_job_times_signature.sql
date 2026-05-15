-- Job timing, CMS tables, enforce signed agreement before completed status

alter table public.appointments
  add column if not exists job_started_at timestamptz,
  add column if not exists job_completed_at timestamptz;

-- ---------- CMS ----------
create table if not exists public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  caption text,
  sort_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  percent_off int,
  active boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.homepage_content (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.gallery_images enable row level security;
alter table public.offers enable row level security;
alter table public.homepage_content enable row level security;

create policy "gallery_images_public_read" on public.gallery_images
  for select using (published = true);

create policy "gallery_images_staff_all" on public.gallery_images
  for all using (public.is_admin_level()) with check (public.is_admin_level());

create policy "offers_public_read_active" on public.offers
  for select using (active = true or public.is_admin_level());

create policy "offers_staff_all" on public.offers
  for all using (public.is_admin_level()) with check (public.is_admin_level());

create policy "homepage_content_public_read" on public.homepage_content
  for select using (true);

create policy "homepage_content_staff_write" on public.homepage_content
  for all using (public.is_admin_level()) with check (public.is_admin_level());

-- ---------- Legal: cannot mark completed without signed agreement ----------
create or replace function public.enforce_signed_before_completed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'completed' and not exists (
    select 1 from public.signed_agreements sa where sa.appointment_id = new.id
  ) then
    raise exception 'Appointment cannot be set to completed without a signed agreement';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_require_signature_before_completed on public.appointments;
create trigger appointments_require_signature_before_completed
  before insert or update of status on public.appointments
  for each row
  when (new.status = 'completed')
  execute function public.enforce_signed_before_completed();

-- Technicians: block completing job without signed agreement (DB + app)
drop policy if exists "appointments_tech_update" on public.appointments;
create policy "appointments_tech_update" on public.appointments
  for update using (
    public.current_role() = 'technician' and assigned_technician_id = auth.uid()
  ) with check (
    public.current_role() = 'technician'
    and assigned_technician_id = auth.uid()
    and (
      status is distinct from 'completed'
      or exists (
        select 1 from public.signed_agreements sa
        where sa.appointment_id = id
      )
    )
  );

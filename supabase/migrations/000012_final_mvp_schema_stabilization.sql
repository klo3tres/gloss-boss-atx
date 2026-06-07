-- Gloss Boss ATX — final MVP schema stabilization (idempotent, safe to re-run)
-- Fixes common drift: profiles.updated_at / email, services metadata + slug, gallery active,
-- ensures CMS/marketing tables exist, seeds optional catalog row, nudges PostgREST schema cache.

-- ---------- profiles ----------
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and (p.email is null or btrim(coalesce(p.email, '')) = '')
  and u.email is not null
  and not exists (
    select 1
    from public.profiles existing
    where lower(existing.email) = lower(u.email)
      and existing.id <> p.id
  );

update public.profiles
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create or replace function public.touch_profiles_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row
  execute function public.touch_profiles_updated_at();

-- New auth users: persist email on profile row when column exists
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_email constant text := 'glossbossatx1@gmail.com';
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    case
      when lower(trim(coalesce(new.email, ''))) = lower(owner_email) then 'super_admin'::public.app_role
      else 'customer'::public.app_role
    end,
    nullif(trim(coalesce(new.email, '')), '')
  );
  return new;
end;
$$;

-- ---------- services (catalog metadata) ----------
alter table public.services add column if not exists description text;
alter table public.services add column if not exists category text;
alter table public.services add column if not exists updated_at timestamptz not null default now();

update public.services
set slug = 'svc-' || replace(id::text, '-', '')
where slug is null or btrim(slug) = '';

-- ---------- gallery_images ----------
alter table public.gallery_images add column if not exists active boolean default true;
update public.gallery_images set active = coalesce(active, published, true);

-- ---------- settings (Stripe / app KV) ----------
create table if not exists public.settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

-- ---------- homepage_content ----------
create table if not exists public.homepage_content (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.homepage_content enable row level security;

drop policy if exists "homepage_content_public_read" on public.homepage_content;
create policy "homepage_content_public_read" on public.homepage_content
  for select using (true);

drop policy if exists "homepage_content_staff_write" on public.homepage_content;
create policy "homepage_content_staff_write" on public.homepage_content
  for all using (public.is_admin_level()) with check (public.is_admin_level());

-- ---------- offers ----------
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  percent_off int,
  active boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.offers add column if not exists title text;
update public.offers set title = label where title is null;
alter table public.offers add column if not exists description text not null default '';
alter table public.offers add column if not exists discount_percent int;
update public.offers set discount_percent = coalesce(percent_off, 0) where discount_percent is null;

alter table public.offers enable row level security;

drop policy if exists "offers_public_read_active" on public.offers;
create policy "offers_public_read_active" on public.offers
  for select using (active = true or public.is_admin_level());

drop policy if exists "offers_staff_all" on public.offers;
create policy "offers_staff_all" on public.offers
  for all using (public.is_admin_level()) with check (public.is_admin_level());

-- ---------- deal_config default ----------
insert into public.homepage_content (key, value, updated_at)
values (
  'deal_config',
  jsonb_build_object(
    'websitePromoPercent', 15,
    'websitePromoLabel', 'Limited Time Website Booking Offer',
    'websitePromoActive', true,
    'multiCarSecondVehicleDiscountPercent', 10
  ),
  now()
)
on conflict (key) do nothing;

-- ---------- Optional catalog tier: exterior detail (between wash and interior) ----------
insert into public.services (slug, title, subtitle, active, sort_order)
values (
  'exterior-detail',
  'Exterior Detail',
  'Clay treatment, polish prep, wax or sealant · Est. 90–120 min',
  true,
  15
)
on conflict (slug) do nothing;

insert into public.service_prices (service_id, vehicle_class, price_cents)
select s.id, p.vehicle_class, p.cents
from public.services s
join (
  values
    ('exterior-detail', 'sedan', 9000),
    ('exterior-detail', 'suv_truck', 11000)
) as p(slug, vehicle_class, cents) on p.slug = s.slug
where not exists (
  select 1 from public.service_prices sp where sp.service_id = s.id and sp.vehicle_class = p.vehicle_class
)
on conflict (service_id, vehicle_class) do nothing;

-- ---------- PostgREST: reload schema cache (Supabase) ----------
notify pgrst, 'reload schema';

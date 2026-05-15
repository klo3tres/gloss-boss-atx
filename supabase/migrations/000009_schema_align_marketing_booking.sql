-- Align schema with app expectations: profiles owner role, gallery aliases, offers columns,
-- service_prices vehicle classes + duration, appointments multi-vehicle + vehicle_class,
-- optional reference seed when catalog is empty (explicit migration, not runtime fallback).

-- ---------- profiles: owner is super_admin on signup ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_email constant text := 'glossbossatx1@gmail.com';
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    case
      when lower(trim(coalesce(new.email, ''))) = lower(owner_email) then 'super_admin'::public.app_role
      else 'customer'::public.app_role
    end
  );
  return new;
end;
$$;

-- ---------- gallery_images: url + order_index (mirror existing columns) ----------
alter table public.gallery_images add column if not exists url text;
update public.gallery_images set url = image_url where url is null;
alter table public.gallery_images add column if not exists order_index int;
update public.gallery_images set order_index = sort_order where order_index is null;

-- ---------- offers: title / description / discount_percent (mirror label / percent_off) ----------
alter table public.offers add column if not exists title text;
update public.offers set title = label where title is null;
alter table public.offers add column if not exists description text not null default '';
alter table public.offers add column if not exists discount_percent int;
update public.offers set discount_percent = coalesce(percent_off, 0) where discount_percent is null;

-- ---------- service_prices: duration + vehicle_class sedan/suv/truck/suv_truck ----------
alter table public.service_prices drop constraint if exists service_prices_vehicle_class_check;
alter table public.service_prices
  add constraint service_prices_vehicle_class_check
  check (vehicle_class in ('sedan', 'suv', 'truck', 'suv_truck'));

alter table public.service_prices add column if not exists duration_minutes int;

-- Duplicate suv_truck row into suv + truck for existing data (idempotent)
insert into public.service_prices (service_id, vehicle_class, price_cents, duration_minutes)
select sp.service_id, 'suv', sp.price_cents, sp.duration_minutes
from public.service_prices sp
where sp.vehicle_class = 'suv_truck'
  and not exists (
    select 1 from public.service_prices x
    where x.service_id = sp.service_id and x.vehicle_class = 'suv'
  );

insert into public.service_prices (service_id, vehicle_class, price_cents, duration_minutes)
select sp.service_id, 'truck', sp.price_cents, sp.duration_minutes
from public.service_prices sp
where sp.vehicle_class = 'suv_truck'
  and not exists (
    select 1 from public.service_prices x
    where x.service_id = sp.service_id and x.vehicle_class = 'truck'
  );

-- ---------- appointments: multi-vehicle JSON + wider vehicle_class ----------
alter table public.appointments add column if not exists booking_vehicles jsonb not null default '[]'::jsonb;

alter table public.appointments drop constraint if exists appointments_vehicle_class_check;
alter table public.appointments
  add constraint appointments_vehicle_class_check
  check (vehicle_class in ('sedan', 'suv', 'truck', 'suv_truck'));

-- ---------- homepage_content: deal_config for dynamic promo / multi-car ----------
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

-- ---------- Reference catalog seed (only when services table is empty) ----------
insert into public.services (slug, title, subtitle, active, sort_order)
select v.slug, v.title, v.subtitle, true, v.sort_order
from (
  values
    ('sedan-wash', 'Sedan Wash', 'Hand wash, wheels, glass · Est. 45–60 min', 10),
    ('suv-detail', 'SUV Detail', 'Exterior detail sized for SUVs · Est. 2–3 hrs', 20),
    ('truck-detail', 'Truck Detail', 'Full-size truck exterior + interior refresh · Est. 3–4 hrs', 30),
    ('full-detail', 'Full Detail', 'Complete inside + outside reset · Est. 4–6 hrs', 40),
    ('ceramic-coating', 'Ceramic Coating', 'Paint prep + professional coating · quote on-site', 50)
) as v(slug, title, subtitle, sort_order)
where not exists (select 1 from public.services limit 1)
on conflict (slug) do nothing;

insert into public.service_prices (service_id, vehicle_class, price_cents, duration_minutes)
select s.id, p.vehicle_class, p.cents, p.dur
from public.services s
join (
  values
    ('sedan-wash', 'sedan', 5500, 55),
    ('sedan-wash', 'suv', 5500, 55),
    ('sedan-wash', 'truck', 5500, 55),
    ('sedan-wash', 'suv_truck', 5500, 55),
    ('suv-detail', 'sedan', 13500, 150),
    ('suv-detail', 'suv', 13500, 150),
    ('suv-detail', 'truck', 13500, 150),
    ('suv-detail', 'suv_truck', 13500, 150),
    ('truck-detail', 'sedan', 15500, 200),
    ('truck-detail', 'suv', 15500, 200),
    ('truck-detail', 'truck', 15500, 200),
    ('truck-detail', 'suv_truck', 15500, 200),
    ('full-detail', 'sedan', 17500, 270),
    ('full-detail', 'suv', 19500, 270),
    ('full-detail', 'truck', 19500, 270),
    ('full-detail', 'suv_truck', 19500, 270),
    ('ceramic-coating', 'sedan', 89900, null),
    ('ceramic-coating', 'suv', 109900, null),
    ('ceramic-coating', 'truck', 109900, null),
    ('ceramic-coating', 'suv_truck', 109900, null)
) as p(slug, vehicle_class, cents, dur) on p.slug = s.slug
where not exists (
  select 1 from public.service_prices sp where sp.service_id = s.id and sp.vehicle_class = p.vehicle_class
)
on conflict (service_id, vehicle_class) do nothing;

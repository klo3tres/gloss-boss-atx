alter table public.staff_invites
  add column if not exists email_delivery_status text,
  add column if not exists email_delivery_error text,
  add column if not exists email_delivery_updated_at timestamptz;

alter table public.appointments
  add column if not exists technician_acknowledged_at timestamptz,
  add column if not exists on_the_way_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists updated_eta_at timestamptz,
  add column if not exists updated_eta_minutes integer,
  add column if not exists delay_reason text,
  add column if not exists delay_approved_by_owner_at timestamptz,
  add column if not exists delay_approved_by_customer_at timestamptz,
  add column if not exists flexible_arrival boolean not null default false;

create index if not exists appointments_late_job_monitor_idx
  on public.appointments (scheduled_start, status)
  where job_started_at is null and archived_at is null and deleted_at is null;

insert into public.services (
  slug, title, subtitle, description, category, active, sort_order, display_order,
  estimated_min_minutes, estimated_max_minutes, public_description, admin_notes, inclusions
)
values (
  'quick-refresh',
  'Gloss Boss Quick Refresh',
  'Maintenance wash and light interior reset',
  'A maintenance service for vehicles that do not need deep interior detailing.',
  'maintenance',
  true,
  15,
  15,
  60,
  90,
  'Exterior maintenance wash, quick interior vacuum, dash and console wipe, interior glass, tire cleaning and shine, and a light fragrance refresh.',
  'Excludes deep interior detailing, shampoo/extraction, heavy stains, excessive pet hair or trash, major crevice work, and biohazard cleanup. Inspect condition before starting; apply configured surcharge or convert to a full interior detail when needed.',
  array['Exterior maintenance wash','Quick interior vacuum','Dash and console wipe','Interior glass','Tire cleaning and shine','Light fragrance refresh']
)
on conflict (slug) do nothing;

insert into public.service_prices (service_id, vehicle_class, price_cents, duration_minutes)
select service.id, pricing.vehicle_class, pricing.price_cents, pricing.duration_minutes
from public.services service
join (values
  ('sedan', 8500, 60),
  ('suv', 10500, 75),
  ('truck', 12500, 90),
  ('suv_truck', 10500, 75)
) as pricing(vehicle_class, price_cents, duration_minutes) on true
where service.slug = 'quick-refresh'
on conflict (service_id, vehicle_class) do nothing;

insert into public.promo_codes (
  code, description, enabled, discount_type, discount_value, service_restrictions, rules, max_uses
)
values (
  'QUICK2',
  'Configurable two-vehicle Quick Refresh offer. Seeded disabled for owner review.',
  false,
  'fixed',
  20,
  '["quick-refresh"]'::jsonb,
  '{"appliesTo":"base_services","services":["quick-refresh"],"vehicleClasses":["sedan"],"minimumVehicles":2,"stackable":false,"paymentMode":"any"}'::jsonb,
  50
)
on conflict (code) do nothing;

-- Safe additive fixes: addons label/name, messages phone, cms_documents meta, appointments booking JSON, messages legacy columns

-- Addons: support label OR name (PostgREST selects use * or resilient fallbacks in app)
alter table public.addons add column if not exists label text;
alter table public.addons add column if not exists name text;

update public.addons
set
  label = coalesce(nullif(trim(label), ''), nullif(trim(name), ''), nullif(trim(slug), ''), 'Add-on'),
  name = coalesce(nullif(trim(name), ''), nullif(trim(label), ''), nullif(trim(slug), ''), 'Add-on')
where label is null or trim(label) = '' or name is null or trim(name) = '';

-- Messages: phone + optional legacy-shaped columns for resilient API inserts
alter table public.messages add column if not exists from_phone text;
alter table public.messages add column if not exists name text;
alter table public.messages add column if not exists email text;
alter table public.messages add column if not exists message text;

-- CMS documents: metadata for JSX template reference uploads
alter table public.cms_documents add column if not exists meta jsonb not null default '{}'::jsonb;

-- Appointments: ensure common online-booking columns exist on older databases
alter table public.appointments add column if not exists booking_vehicles jsonb not null default '[]'::jsonb;
alter table public.appointments add column if not exists booking_add_ons jsonb not null default '[]'::jsonb;
alter table public.appointments add column if not exists booking_source text;
alter table public.appointments add column if not exists offer_id uuid references public.offers (id) on delete set null;

notify pgrst, 'reload schema';

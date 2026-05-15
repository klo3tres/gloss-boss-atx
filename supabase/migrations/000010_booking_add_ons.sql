-- Optional structured add-ons per booking (array of labels / slugs from UI).
alter table public.appointments add column if not exists booking_add_ons jsonb not null default '[]'::jsonb;

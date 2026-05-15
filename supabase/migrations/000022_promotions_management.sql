-- Promotions: placement, scheduling, fixed discounts, soft archive (non-destructive).

alter table public.offers add column if not exists archived boolean not null default false;

alter table public.offers add column if not exists discount_fixed_cents integer;

alter table public.offers add column if not exists show_on_homepage boolean not null default true;

alter table public.offers add column if not exists show_on_services boolean not null default true;

alter table public.offers add column if not exists show_on_booking boolean not null default true;

alter table public.offers add column if not exists starts_at timestamptz;

alter table public.offers add column if not exists ends_at timestamptz;

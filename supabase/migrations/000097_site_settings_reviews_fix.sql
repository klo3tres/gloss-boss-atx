-- Fix site_settings.updated_at (schema cache errors) + customer_reviews public fields

alter table public.site_settings
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.site_settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_settings_updated_at on public.site_settings;
create trigger site_settings_updated_at
  before update on public.site_settings
  for each row execute function public.site_settings_set_updated_at();

-- Backfill updated_at on existing rows
update public.site_settings set updated_at = now() where updated_at is null;

alter table public.customer_reviews add column if not exists review_text text;
alter table public.customer_reviews add column if not exists vehicle_label text;
alter table public.customer_reviews add column if not exists source text not null default 'manual';
alter table public.customer_reviews add column if not exists featured boolean not null default false;
alter table public.customer_reviews add column if not exists show_on_homepage boolean not null default true;

update public.customer_reviews
set review_text = testimonial
where review_text is null and testimonial is not null;

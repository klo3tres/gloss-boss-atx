-- Complete gallery manager columns used by the work-order photo publishing flow.
-- Additive only: no rows are removed and no production media is touched.

alter table if exists public.gallery_images
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists title text,
  add column if not exists active boolean default true,
  add column if not exists url text,
  add column if not exists public_url text,
  add column if not exists order_index integer,
  add column if not exists before_photo_url text,
  add column if not exists after_photo_url text,
  add column if not exists vehicle_type text,
  add column if not exists service_category text,
  add column if not exists destination text default 'gallery',
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists public_caption text,
  add column if not exists watermark boolean default true,
  add column if not exists archived boolean default false;

update public.gallery_images
set
  url = coalesce(url, image_url),
  order_index = coalesce(order_index, sort_order),
  active = coalesce(active, published, true)
where true;

create index if not exists idx_gallery_images_destination_featured
  on public.gallery_images (destination, featured, published);

create index if not exists idx_gallery_images_vehicle_service
  on public.gallery_images (vehicle_type, service_category);

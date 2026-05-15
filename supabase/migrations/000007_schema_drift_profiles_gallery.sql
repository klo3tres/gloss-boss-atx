-- Fix drift vs app code: missing profiles.full_name, missing gallery_images (or policies).
-- Safe to re-run.

-- ---------- profiles ----------
alter table public.profiles add column if not exists full_name text;

-- ---------- gallery (marketing + /api/gallery/public) ----------
create table if not exists public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  caption text,
  sort_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.gallery_images add column if not exists featured boolean not null default false;

alter table public.gallery_images enable row level security;

drop policy if exists "gallery_images_public_read" on public.gallery_images;
create policy "gallery_images_public_read" on public.gallery_images
  for select using (published = true);

drop policy if exists "gallery_images_staff_all" on public.gallery_images;
create policy "gallery_images_staff_all" on public.gallery_images
  for all using (public.is_admin_level()) with check (public.is_admin_level());

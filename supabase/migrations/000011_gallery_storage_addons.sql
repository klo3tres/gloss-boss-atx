-- Public gallery bucket + read policy; optional add-ons catalog for booking UI.

-- ---------- Storage: public gallery bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery',
  'gallery',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read gallery objects" on storage.objects;
create policy "Public read gallery objects"
  on storage.objects for select
  using (bucket_id = 'gallery');

-- ---------- Add-ons catalog (optional; booking still accepts free-text labels) ----------
create table if not exists public.addons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  price_cents int not null default 0,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.addons enable row level security;

drop policy if exists "addons_public_read" on public.addons;
create policy "addons_public_read"
  on public.addons for select
  to anon, authenticated
  using (active = true);

drop policy if exists "addons_admin_all" on public.addons;
create policy "addons_admin_all"
  on public.addons for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('admin', 'super_admin')
    )
  );

insert into public.addons (slug, label, price_cents, active, sort_order)
values
  ('engine_bay', 'Engine bay detail', 0, true, 10),
  ('pet_hair', 'Pet hair removal', 0, true, 20),
  ('odor', 'Odor treatment', 0, true, 30),
  ('clay_bar', 'Clay bar treatment', 0, true, 40)
on conflict (slug) do nothing;

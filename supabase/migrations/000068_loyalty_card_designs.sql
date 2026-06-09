-- Create loyalty_card_designs table and storage bucket for loyalty card customization.

create table if not exists public.loyalty_card_designs (
  id uuid primary key default gen_random_uuid(),
  tier text,
  name text not null,
  front_image_url text,
  front_image_path text,
  back_image_url text,
  back_image_path text,
  active boolean default false,
  archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.loyalty_card_designs enable row level security;

drop policy if exists "Allow public read access to loyalty_card_designs" on public.loyalty_card_designs;
create policy "Allow public read access to loyalty_card_designs"
  on public.loyalty_card_designs for select
  using (true);

drop policy if exists "Allow admin write access to loyalty_card_designs" on public.loyalty_card_designs;
create policy "Allow admin write access to loyalty_card_designs"
  on public.loyalty_card_designs for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('admin', 'super_admin')
    )
  );

-- Create storage bucket for loyalty-cards
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'loyalty-cards',
  'loyalty-cards',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read loyalty-cards objects" on storage.objects;
create policy "Public read loyalty-cards objects"
  on storage.objects for select
  using (bucket_id = 'loyalty-cards');

drop policy if exists "Admin write loyalty-cards objects" on storage.objects;
create policy "Admin write loyalty-cards objects"
  on storage.objects for all
  using (
    bucket_id = 'loyalty-cards'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('admin', 'super_admin')
    )
  );

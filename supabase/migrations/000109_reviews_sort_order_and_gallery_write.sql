-- Migration 000109: Reviews sort order and gallery write storage policy

-- 1. Add sort_order to customer_reviews
alter table public.customer_reviews
  add column if not exists sort_order integer not null default 0;

-- 2. Add write policy to gallery bucket
drop policy if exists "Admin write gallery objects" on storage.objects;
create policy "Admin write gallery objects"
  on storage.objects for all
  using (
    bucket_id = 'gallery'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('admin', 'super_admin')
    )
  );

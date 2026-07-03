-- Theme preferences + tighten loyalty_stamps / site_media_assets read policies

alter table if exists public.profiles
  add column if not exists theme_preference text not null default 'system'
    check (theme_preference in ('light', 'dark', 'system'));

-- loyalty_stamps: staff read all; customers read own stamps only
drop policy if exists "Allow public read access to loyalty_stamps" on public.loyalty_stamps;
drop policy if exists "loyalty_stamps_select_scoped" on public.loyalty_stamps;
create policy "loyalty_stamps_select_scoped"
  on public.loyalty_stamps for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.customers c
      where c.id = loyalty_stamps.customer_id
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- site_media_assets: staff only (public site reads via service role / server components)
drop policy if exists "site_media_assets_admin" on public.site_media_assets;
drop policy if exists "site_media_assets_staff" on public.site_media_assets;
create policy "site_media_assets_staff"
  on public.site_media_assets for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

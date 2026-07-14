-- Atomically select the single live homepage hero asset for a workspace.
create or replace function public.set_homepage_hero_asset(
  p_asset_id uuid,
  p_workspace_key text default 'default'
)
returns public.site_media_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  selected public.site_media_assets;
  target_placement text;
begin
  perform pg_advisory_xact_lock(hashtext('homepage-hero:' || coalesce(p_workspace_key, 'default')));

  select * into selected
  from public.site_media_assets
  where id = p_asset_id and workspace_key = p_workspace_key
  for update;

  if selected.id is null then
    raise exception 'Media asset not found in workspace';
  end if;
  if selected.media_type not in ('image', 'video') then
    raise exception 'Homepage hero must be an image or video';
  end if;
  if coalesce(selected.public_url, selected.external_url, '') = '' then
    raise exception 'Homepage hero requires a public URL';
  end if;

  target_placement := case when selected.media_type = 'video' then 'homepage_hero_video' else 'homepage_hero_image' end;

  update public.site_media_assets
  set is_active = false, updated_at = now()
  where workspace_key = p_workspace_key
    and placement in ('homepage_hero_image', 'homepage_hero_video')
    and id <> p_asset_id;

  update public.site_media_assets
  set placement = target_placement, is_active = true, updated_at = now()
  where id = p_asset_id
  returning * into selected;

  return selected;
end;
$$;

revoke all on function public.set_homepage_hero_asset(uuid, text) from public;
grant execute on function public.set_homepage_hero_asset(uuid, text) to service_role;

with ranked as (
  select id, row_number() over (partition by workspace_key, placement order by updated_at desc, created_at desc, id desc) as rn
  from public.site_media_assets
  where placement in ('homepage_hero_image', 'homepage_hero_video') and is_active = true
)
update public.site_media_assets a
set is_active = false, updated_at = now()
from ranked r
where a.id = r.id and r.rn > 1;

create unique index if not exists site_media_assets_one_active_homepage_image
  on public.site_media_assets (workspace_key)
  where placement = 'homepage_hero_image' and is_active = true;

create unique index if not exists site_media_assets_one_active_homepage_video
  on public.site_media_assets (workspace_key)
  where placement = 'homepage_hero_video' and is_active = true;

-- Website Intelligence: Search Console manual verification fields

alter table public.titan_workspace_settings
  add column if not exists gsc_verified boolean not null default false,
  add column if not exists gsc_property_url text,
  add column if not exists gsc_last_verified_at timestamptz;

update public.titan_workspace_settings
set
  gsc_property_url = coalesce(gsc_property_url, website_url, 'https://www.glossbossatx.com/'),
  gsc_verified = coalesce(gsc_verified, false)
where workspace_key = 'default';

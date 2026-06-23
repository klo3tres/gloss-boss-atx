-- Maps provider settings + social outreach manual mode

alter table public.titan_workspace_settings
  add column if not exists map_provider text not null default 'list_only' check (
    map_provider in ('google_maps', 'apple_mapkit', 'list_only')
  );

create table if not exists public.titan_social_outreach (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook_group', 'instagram', 'nextdoor', 'other')),
  label text not null,
  url text,
  keywords text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.titan_social_posts (
  id uuid primary key default gen_random_uuid(),
  outreach_id uuid references public.titan_social_outreach (id) on delete set null,
  platform text not null default 'facebook_group',
  post_text text not null,
  author_name text,
  found_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'replied', 'dm_sent', 'ignored', 'converted')),
  generated_reply text,
  generated_dm text,
  outcome text,
  outcome_notes text,
  created_at timestamptz not null default now()
);

create index if not exists titan_social_posts_status_idx on public.titan_social_posts (status, found_at desc);

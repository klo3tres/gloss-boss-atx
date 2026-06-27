-- Owner identity + contact routing for greetings and notifications
alter table public.titan_workspace_settings
  add column if not exists owner_display_name text,
  add column if not exists owner_email text,
  add column if not exists owner_phone text;

comment on column public.titan_workspace_settings.owner_display_name is 'How Titan and dashboards greet the owner (e.g. Kyle)';
comment on column public.titan_workspace_settings.owner_email is 'Owner alert email — overrides env when set';
comment on column public.titan_workspace_settings.owner_phone is 'Owner alert SMS — overrides env when set';

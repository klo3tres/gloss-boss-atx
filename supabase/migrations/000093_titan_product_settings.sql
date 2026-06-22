-- Titan product layer toggles on workspace settings.

alter table public.titan_workspace_settings
  add column if not exists public_widget_enabled boolean not null default true,
  add column if not exists operator_assistant_enabled boolean not null default true,
  add column if not exists powered_by_branding_enabled boolean not null default true;

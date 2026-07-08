-- Per-user UI preferences + public site default theme (super admin only)

alter table if exists public.profiles
  add column if not exists ui_accent text not null default 'gold'
    check (ui_accent in ('gold', 'amber', 'emerald')),
  add column if not exists ui_sidebar_density text not null default 'comfortable'
    check (ui_sidebar_density in ('comfortable', 'compact')),
  add column if not exists ui_dashboard_density text not null default 'comfortable'
    check (ui_dashboard_density in ('comfortable', 'compact'));

-- website_default_theme stored in site_settings key (light | dark)

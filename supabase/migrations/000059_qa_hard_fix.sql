-- QA hard fix: notification template columns, ops date aliases, template uniqueness per channel

alter table public.notification_templates add column if not exists name text;
alter table public.notification_templates add column if not exists enabled boolean default true;
alter table public.notification_templates add column if not exists variables jsonb default '[]'::jsonb;

update public.notification_templates
set
  name = coalesce(nullif(trim(name), ''), initcap(replace(template_key, '_', ' '))),
  enabled = coalesce(enabled, active, true)
where name is null or name = '' or enabled is null;

alter table public.business_expenses add column if not exists incurred_on timestamptz;
alter table public.job_mileage_logs add column if not exists logged_on timestamptz;

update public.business_expenses set incurred_on = coalesce(incurred_on, incurred_at, created_at) where incurred_on is null;
update public.job_mileage_logs set logged_on = coalesce(logged_on, created_at) where logged_on is null;

-- Backfill incurred_at / created_at from legacy names if present
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'business_expenses' and column_name = 'incurred_on'
  ) then
    update public.business_expenses set incurred_at = coalesce(incurred_at, incurred_on) where incurred_at is null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_mileage_logs' and column_name = 'logged_on'
  ) then
    update public.job_mileage_logs set created_at = coalesce(created_at, logged_on) where created_at is null;
  end if;
end $$;

-- Allow multiple channels per template_key (drop single-column unique if present)
do $$
declare
  cname text;
begin
  for cname in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'notification_templates'
      and con.contype = 'u'
      and array_length(con.conkey, 1) = 1
  loop
    execute format('alter table public.notification_templates drop constraint if exists %I', cname);
  end loop;
end $$;

create unique index if not exists notification_templates_key_channel_uidx
  on public.notification_templates (template_key, channel);

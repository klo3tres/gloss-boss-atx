-- Fix placeholder workspace branding and ensure Gloss Boss ATX is the canonical display name.
update titan_workspace_settings
set
  business_name = 'Gloss Boss ATX',
  business_display_name = 'Gloss Boss ATX',
  brand_short_name = case
    when lower(trim(coalesce(brand_short_name, ''))) in ('', 'my business') then 'Gloss Boss'
    else brand_short_name
  end,
  legal_business_name = coalesce(nullif(trim(legal_business_name), ''), 'Gloss Boss ATX'),
  updated_at = now()
where lower(trim(coalesce(business_name, ''))) = 'my business'
   or lower(trim(coalesce(business_display_name, ''))) = 'my business'
   or lower(trim(coalesce(brand_short_name, ''))) = 'my business'
   or business_display_name is null
   or trim(business_display_name) = '';

-- Prefer Gloss Boss ATX as the column default for new workspace rows.
alter table titan_workspace_settings
  alter column business_name set default 'Gloss Boss ATX';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'titan_workspace_settings' and column_name = 'business_display_name'
  ) then
    alter table titan_workspace_settings alter column business_display_name set default 'Gloss Boss ATX';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_name = 'titan_workspace_settings' and column_name = 'brand_short_name'
  ) then
    alter table titan_workspace_settings alter column brand_short_name set default 'Gloss Boss';
  end if;
end $$;

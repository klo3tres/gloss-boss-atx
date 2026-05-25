-- Scoped promo rules + TEST1 seed

alter table public.promo_codes
  add column if not exists rules jsonb not null default '{}'::jsonb;

comment on column public.promo_codes.rules is 'JSON: appliesTo, vehicleClasses, services, addonSlug, paymentMode, stackable';

insert into public.promo_codes (code, description, enabled, discount_type, discount_value, service_restrictions, rules)
values (
  'SHAMPOO20',
  '$20 off upholstery shampoo add-on only',
  true,
  'fixed',
  20,
  '[]'::jsonb,
  '{"appliesTo":"specific_addon","addonSlug":"upholstery-shampoo","stackable":false,"paymentMode":"any"}'::jsonb
)
on conflict (code) do update set
  description = excluded.description,
  rules = excluded.rules,
  discount_type = excluded.discount_type,
  discount_value = excluded.discount_value;

insert into public.promo_codes (code, description, enabled, discount_type, discount_value, service_restrictions, rules)
values (
  'TEST1',
  '$1 Stripe test checkout',
  true,
  'fixed',
  1,
  '[]'::jsonb,
  '{"appliesTo":"order","paymentMode":"full","stackable":true}'::jsonb
)
on conflict (code) do update set
  description = excluded.description,
  enabled = excluded.enabled,
  rules = excluded.rules;

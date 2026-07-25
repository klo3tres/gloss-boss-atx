-- Normalize the production agreement table to the canonical application shape.
-- Older deployments used full_name/signature_text/agreed_at while current code
-- uses signer_legal_name/signature_type/signature_data/signed_at.

alter table public.signed_agreements
  add column if not exists full_name text,
  add column if not exists signature_text text,
  add column if not exists agreed_at timestamptz,
  add column if not exists signer_legal_name text,
  add column if not exists signature_type text,
  add column if not exists signature_data text,
  add column if not exists template_id uuid,
  add column if not exists template_version integer,
  add column if not exists ip_address text,
  add column if not exists user_agent text,
  add column if not exists signed_at timestamptz default now();

update public.signed_agreements
set
  signer_legal_name = coalesce(nullif(signer_legal_name, ''), nullif(full_name, '')),
  signature_type = coalesce(nullif(signature_type, ''), 'typed'),
  signature_data = coalesce(signature_data, signature_text),
  template_version = coalesce(template_version, terms_version, 1),
  signed_at = coalesce(signed_at, agreed_at, now())
where
  signer_legal_name is null
  or signature_type is null
  or signature_data is null
  or template_version is null
  or signed_at is null;

create index if not exists signed_agreements_appointment_signed_idx
  on public.signed_agreements (appointment_id, signed_at desc);

insert into public.site_settings(key,value)
values (
  'migration_marker_000147',
  jsonb_build_object('name','signed_agreement_schema_compatibility','applied',true,'version',147)
)
on conflict (key) do update set value=excluded.value, updated_at=now();

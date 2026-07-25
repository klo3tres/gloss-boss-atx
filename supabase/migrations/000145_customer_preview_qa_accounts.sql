-- QA customer identities created by controlled customer-flow clones.

alter table public.customers
  add column if not exists is_test boolean not null default false,
  add column if not exists qa_expires_at timestamptz;

create index if not exists customers_qa_account_idx
  on public.customers (is_test, qa_expires_at)
  where is_test = true;

insert into public.site_settings(key,value)
values ('migration_marker_000145', jsonb_build_object('name','customer_preview_qa_accounts','applied',true,'version',145))
on conflict (key) do update set value=excluded.value, updated_at=now();

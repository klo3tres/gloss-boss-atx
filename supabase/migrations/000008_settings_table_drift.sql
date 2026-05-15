-- If earlier migrations were never applied, ensure `settings` exists (Stripe keys in DB, etc.).

create table if not exists public.settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

comment on table public.settings is 'Server-side key/value store (e.g. Stripe secrets). Use service role in Next.js only.';

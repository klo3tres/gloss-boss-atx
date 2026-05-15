-- App settings (Stripe keys, etc.) — readable/writable only via service role in app code.
-- RLS enabled with no policies = deny for anon/authenticated JWT.

create table if not exists public.settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

-- No GRANT to anon/authenticated for settings — service role bypasses RLS.

comment on table public.settings is 'Server-side key/value store (e.g. Stripe secrets). Use service role in Next.js only.';

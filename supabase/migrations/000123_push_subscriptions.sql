-- Web push subscriptions for staff browser notifications

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_service on public.push_subscriptions;
create policy push_subscriptions_service on public.push_subscriptions
  for all using (public.is_admin_level());

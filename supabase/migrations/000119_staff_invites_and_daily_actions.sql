-- Staff onboarding invites + Titan daily executable actions

alter type public.app_role add value if not exists 'dispatcher';
alter type public.app_role add value if not exists 'viewer';

create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default',
  invited_by uuid references auth.users (id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  role text not null check (role in ('super_admin', 'admin', 'dispatcher', 'technician', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  auth_user_id uuid references auth.users (id) on delete set null,
  last_sent_at timestamptz,
  last_sent_channel text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_invites_status_idx on public.staff_invites (status, expires_at desc);
create index if not exists staff_invites_token_hash_idx on public.staff_invites (token_hash);
create index if not exists staff_invites_email_idx on public.staff_invites (lower(email));

create table if not exists public.titan_daily_actions (
  id uuid primary key default gen_random_uuid(),
  action_date date not null default (timezone('America/Chicago', now()))::date,
  action_key text not null,
  action_type text not null,
  title text not null,
  involved_names text,
  reason text,
  expected_value_cents integer not null default 0,
  confidence_score integer not null default 70,
  confidence_label text,
  message_script text,
  contact_phone text,
  contact_email text,
  entity_type text,
  entity_id text,
  href text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'dismissed', 'completed')),
  sent_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (action_date, action_key)
);

create index if not exists titan_daily_actions_date_status_idx on public.titan_daily_actions (action_date, status);

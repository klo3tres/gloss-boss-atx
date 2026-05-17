create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  channel text not null default 'email',
  subject text,
  body text not null default '',
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.message_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid,
  customer_id uuid,
  admin_user_id uuid,
  channel text default 'email',
  subject text,
  body text not null,
  status text default 'draft',
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz default now()
);

alter table public.appointments add column if not exists payment_choice text default 'deposit';
alter table public.appointments add column if not exists full_paid_at timestamptz;
alter table public.appointments add column if not exists payment_status text;
alter table public.appointments add column if not exists balance_due_cents integer;
alter table public.appointments add column if not exists booking_pricing_breakdown jsonb default '{}'::jsonb;
alter table public.appointments add column if not exists archived boolean default false;
alter table public.appointments add column if not exists archived_at timestamptz;
alter table public.appointments add column if not exists deleted_at timestamptz;

alter table public.booking_fallbacks add column if not exists payment_choice text default 'deposit';
alter table public.booking_fallbacks add column if not exists full_paid_at timestamptz;
alter table public.booking_fallbacks add column if not exists payment_status text;
alter table public.booking_fallbacks add column if not exists balance_due_cents integer;
alter table public.booking_fallbacks add column if not exists booking_pricing_breakdown jsonb default '{}'::jsonb;
alter table public.booking_fallbacks add column if not exists archived boolean default false;
alter table public.booking_fallbacks add column if not exists archived_at timestamptz;
alter table public.booking_fallbacks add column if not exists deleted_at timestamptz;

alter table public.payments add column if not exists payment_choice text;
alter table public.payments add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.signed_agreements add column if not exists archived boolean default false;
alter table public.signed_agreements add column if not exists archived_at timestamptz;
alter table public.signed_agreements add column if not exists deleted_at timestamptz;
alter table public.signed_agreements add column if not exists work_order_id uuid;
alter table public.signed_agreements add column if not exists payment_id uuid;
alter table public.signed_agreements add column if not exists fallback_booking_id uuid;

alter table public.intake_submissions add column if not exists archived boolean default false;
alter table public.intake_submissions add column if not exists archived_at timestamptz;
alter table public.intake_submissions add column if not exists deleted_at timestamptz;
alter table public.intake_submissions add column if not exists work_order_id uuid;
alter table public.intake_submissions add column if not exists payment_id uuid;
alter table public.intake_submissions add column if not exists fallback_booking_id uuid;

alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages add column if not exists replied_at timestamptz;
alter table public.messages add column if not exists reply_body text;
alter table public.messages add column if not exists reply_status text;
alter table public.messages add column if not exists archived_at timestamptz;

alter table public.notification_outbox add column if not exists template_key text;
alter table public.notification_outbox add column if not exists provider_message_id text;
alter table public.notification_outbox add column if not exists error_message text;
alter table public.notification_outbox add column if not exists skipped_reason text;
alter table public.notification_outbox add column if not exists sent_at timestamptz;

alter table public.work_orders add column if not exists booking_pricing_breakdown jsonb default '{}'::jsonb;
alter table public.work_orders add column if not exists payment_choice text;
alter table public.work_orders add column if not exists full_paid_at timestamptz;
alter table public.work_orders add column if not exists archived boolean default false;
alter table public.work_orders add column if not exists archived_at timestamptz;
alter table public.work_orders add column if not exists deleted_at timestamptz;

alter table public.leads add column if not exists archived boolean default false;
alter table public.leads add column if not exists archived_at timestamptz;
alter table public.leads add column if not exists deleted_at timestamptz;

create index if not exists idx_message_replies_message_id on public.message_replies(message_id);
create index if not exists idx_notification_templates_key on public.notification_templates(template_key);
create index if not exists idx_messages_read_archived on public.messages(read_at, archived_at);
create index if not exists idx_appointments_payment_choice on public.appointments(payment_choice);

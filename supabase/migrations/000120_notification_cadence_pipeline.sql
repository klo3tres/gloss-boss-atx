-- Customer notification cadence, scheduled messages, opportunity pipeline, referral prefs

-- Flexible notification cadence rules (editable in admin)
create table if not exists public.notification_cadence_rules (
  rule_key text primary key,
  label text not null,
  enabled boolean not null default true,
  sms_enabled boolean not null default true,
  email_enabled boolean not null default true,
  delay_hours integer not null default 0,
  delay_days integer not null default 0,
  service_type_filter text,
  sms_template text not null,
  email_subject text not null,
  email_body text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.notification_cadence_rules (rule_key, label, delay_hours, delay_days, sms_template, email_subject, email_body, sort_order)
values
  (
    'welcome_booking',
    'Welcome / booking confirmation',
    0, 0,
    'Gloss Boss ATX: Your detail is confirmed! View your portal, loyalty card, and updates: {{portal_link}} Reply STOP to opt out of texts.',
    'Your Gloss Boss appointment is confirmed',
    'Hi {{customer}},\n\nYour mobile detailing appointment is confirmed. View your customer portal for updates, photos, and loyalty rewards:\n{{portal_link}}\n\n— Gloss Boss ATX',
    10
  ),
  (
    'appointment_reminder_24h',
    '24-hour appointment reminder',
    24, 0,
    'Gloss Boss ATX: Reminder — your detail is tomorrow at {{time}}. {{address}} Reply STOP to opt out.',
    'Reminder: your detail is tomorrow',
    'Hi {{customer}},\n\nThis is a reminder that your Gloss Boss ATX detail is scheduled for tomorrow at {{time}}.\n{{address}}\n\n— Gloss Boss ATX',
    20
  ),
  (
    'appointment_enroute_2h',
    '2-hour on-the-way notice (optional)',
    2, 0,
    'Gloss Boss ATX: We will be heading your way in about 2 hours for your {{time}} detail. Reply STOP to opt out.',
    'On the way soon',
    'Hi {{customer}},\n\nWe will be heading your way in about 2 hours for your scheduled detail.\n\n— Gloss Boss ATX',
    25
  ),
  (
    'post_service_thank_you',
    'Post-service thank you',
    2, 0,
    'Gloss Boss ATX: Thank you for trusting us with your vehicle today! Hope it looks amazing. Reply STOP to opt out.',
    'Thank you from Gloss Boss ATX',
    'Hi {{customer}},\n\nThank you for choosing Gloss Boss ATX today. We hope your vehicle looks incredible.\n\n— Kyle & the Gloss Boss team',
    30
  ),
  (
    'post_service_referral',
    'Post-service referral invite',
    4, 0,
    'Gloss Boss ATX: Know someone who needs a detail? Share your link and you both save: {{referral_link}} Reply STOP to opt out.',
    'Share Gloss Boss with a friend',
    'Hi {{customer}},\n\nIf you know someone who would love mobile detailing, share your referral link:\n{{referral_link}}\n\n— Gloss Boss ATX',
    35
  ),
  (
    'post_service_review',
    'Post-service review request',
    6, 0,
    'Gloss Boss ATX: If we earned it, a quick Google review helps a ton: {{review_link}} Reply STOP to opt out.',
    'How did we do?',
    'Hi {{customer}},\n\nIf you have a moment, a Google review helps other Austin drivers find us:\n{{review_link}}\n\nThank you!\n— Gloss Boss ATX',
    40
  ),
  (
    'rebook_14d',
    '14-day refresh rebook',
    0, 14,
    'Gloss Boss ATX: Your vehicle should still be looking good — want to lock in a refresh wash? Book: {{book_link}} Reply STOP to opt out.',
    'Time for a refresh wash?',
    'Hi {{customer}},\n\nYour vehicle should still be looking great. Want to lock in a refresh wash?\n\nBook: {{book_link}}\n\n— Gloss Boss ATX',
    50
  ),
  (
    'rebook_45d_exterior',
    '45-day exterior wash rebook',
    0, 45,
    'Gloss Boss ATX: It has been about 6 weeks since your exterior wash. Book a refresh: {{book_link}} Reply STOP to opt out.',
    'Exterior wash due',
    'Hi {{customer}},\n\nIt has been about 6 weeks since your last exterior service. Book a refresh wash:\n{{book_link}}\n\n— Gloss Boss ATX',
    60
  ),
  (
    'rebook_60d_detail',
    '60-day full detail rebook',
    0, 60,
    'Gloss Boss ATX: Ready for your next full detail? Book here: {{book_link}} Reply STOP to opt out.',
    'Time for your next detail',
    'Hi {{customer}},\n\nIt has been about 2 months since your last full detail. Ready to get back on the schedule?\n\n{{book_link}}\n\n— Gloss Boss ATX',
    70
  ),
  (
    'rebook_90d_ceramic',
    '90-day ceramic/protection rebook',
    0, 90,
    'Gloss Boss ATX: Your protection detail may be due for maintenance. Book: {{book_link}} Reply STOP to opt out.',
    'Protection maintenance check-in',
    'Hi {{customer}},\n\nYour ceramic or protection detail may be due for a maintenance check. Book here:\n{{book_link}}\n\n— Gloss Boss ATX',
    80
  )
on conflict (rule_key) do nothing;

-- Scheduled outbound messages (preview/send/schedule workflow)
create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  rule_key text,
  channel text not null check (channel in ('sms', 'email')),
  recipient text not null,
  subject text,
  body text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'cancelled', 'failed', 'skipped')),
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  skipped_reason text,
  customer_id uuid references public.customers (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  opportunity_id uuid references public.titan_opportunities (id) on delete set null,
  entity_type text,
  entity_id text,
  created_by uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scheduled_messages_due on public.scheduled_messages (status, scheduled_for);
create index if not exists idx_scheduled_messages_customer on public.scheduled_messages (customer_id);

-- Customer notification preferences
alter table public.customers add column if not exists notification_preferences jsonb not null default '{}'::jsonb;
alter table public.customers add column if not exists email_marketing_opt_in boolean not null default true;

-- Opportunity pipeline fields
alter table public.titan_opportunities add column if not exists business_name text;
alter table public.titan_opportunities add column if not exists business_category text;
alter table public.titan_opportunities add column if not exists business_address text;
alter table public.titan_opportunities add column if not exists website_url text;
alter table public.titan_opportunities add column if not exists estimated_vehicle_count integer;
alter table public.titan_opportunities add column if not exists distance_miles numeric(8,2);
alter table public.titan_opportunities add column if not exists follow_up_cadence_paused boolean not null default false;
alter table public.titan_opportunities add column if not exists follow_up_step integer not null default 0;
alter table public.titan_opportunities add column if not exists seeded_at timestamptz;
alter table public.titan_opportunities add column if not exists snoozed_until timestamptz;
alter table public.titan_opportunities add column if not exists value_explanation text;

-- Link quotes to opportunities
alter table public.service_estimates add column if not exists opportunity_id uuid references public.titan_opportunities (id) on delete set null;
create index if not exists idx_service_estimates_opportunity on public.service_estimates (opportunity_id);

-- Relax status constraint for pipeline statuses
alter table public.titan_opportunities drop constraint if exists titan_opportunities_status_check;
alter table public.titan_opportunities add constraint titan_opportunities_status_check check (
  status in (
    'new', 'seeded', 'contacted', 'quoted', 'follow_up', 'booked', 'won', 'lost', 'ignored', 'snoozed',
    'replied', 'pipeline', 'dismissed'
  )
);

alter table public.notification_cadence_rules enable row level security;
alter table public.scheduled_messages enable row level security;

drop policy if exists notification_cadence_rules_staff on public.notification_cadence_rules;
create policy notification_cadence_rules_staff on public.notification_cadence_rules for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin', 'dispatcher'))
);

drop policy if exists scheduled_messages_staff on public.scheduled_messages;
create policy scheduled_messages_staff on public.scheduled_messages for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'super_admin', 'dispatcher', 'technician'))
);

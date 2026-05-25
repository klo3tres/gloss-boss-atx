-- Pre-inspection liability: required before photos, damage acknowledgement, admin overrides

create table if not exists public.pre_inspection_damage_ack (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete cascade,
  fallback_booking_id uuid references public.booking_fallbacks(id) on delete cascade,
  vehicle_index int not null default 0,
  vehicle_label text,
  damage_notes text,
  no_visible_damage boolean not null default false,
  customer_acknowledged boolean not null default false,
  customer_signature_name text,
  technician_id uuid references public.profiles(id) on delete set null,
  technician_name text,
  witness_name text,
  acknowledged_at timestamptz,
  linked_photo_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pre_inspection_damage_ack_job_chk check (
    appointment_id is not null or fallback_booking_id is not null
  )
);

create index if not exists pre_inspection_damage_ack_appt_idx
  on public.pre_inspection_damage_ack (appointment_id);
create index if not exists pre_inspection_damage_ack_fallback_idx
  on public.pre_inspection_damage_ack (fallback_booking_id);

alter table public.appointments
  add column if not exists pre_inspection_override_reason text,
  add column if not exists pre_inspection_override_by uuid references public.profiles(id) on delete set null,
  add column if not exists pre_inspection_override_at timestamptz,
  add column if not exists completion_override_reason text,
  add column if not exists completion_override_by uuid references public.profiles(id) on delete set null,
  add column if not exists completion_override_at timestamptz;

alter table public.booking_fallbacks
  add column if not exists pre_inspection_override_reason text,
  add column if not exists pre_inspection_override_by uuid references public.profiles(id) on delete set null,
  add column if not exists pre_inspection_override_at timestamptz,
  add column if not exists completion_override_reason text,
  add column if not exists completion_override_by uuid references public.profiles(id) on delete set null,
  add column if not exists completion_override_at timestamptz;

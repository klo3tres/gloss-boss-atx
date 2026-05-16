-- CRM UI + workflow polish (additive only): staff active flag, booking_fallback ops linkage, optional message resolution timestamp.

-- ---------- profiles: active roster flag ----------
alter table public.profiles add column if not exists active boolean not null default true;

comment on column public.profiles.active is 'When false, staff is hidden from assignment pickers; auth user is unchanged.';

-- ---------- booking_fallbacks: assignment + notes (for dispatch / ops visibility) ----------
alter table public.booking_fallbacks add column if not exists assigned_technician_id uuid references public.profiles (id) on delete set null;
alter table public.booking_fallbacks add column if not exists assigned_by uuid references public.profiles (id) on delete set null;
alter table public.booking_fallbacks add column if not exists assigned_at timestamptz;
alter table public.booking_fallbacks add column if not exists notes text;

create index if not exists idx_booking_fallbacks_assigned on public.booking_fallbacks (assigned_technician_id);

-- ---------- messages: optional resolution timestamp ----------
alter table public.messages add column if not exists resolved_at timestamptz;

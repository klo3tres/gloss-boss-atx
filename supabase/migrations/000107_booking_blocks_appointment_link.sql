-- Link Titan appointments to booking availability blocks

alter table public.booking_availability_blocks
  add column if not exists appointment_id uuid references public.appointments(id) on delete cascade;

create unique index if not exists booking_availability_blocks_appointment_uidx
  on public.booking_availability_blocks (appointment_id)
  where appointment_id is not null;

create index if not exists booking_availability_blocks_range_idx
  on public.booking_availability_blocks (start_at, end_at);

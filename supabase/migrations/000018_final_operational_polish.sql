-- Final operational polish: offers.stackable, messages.name alias, booking.offer_id audit column.
-- Idempotent only. No destructive changes.

alter table public.offers add column if not exists stackable boolean not null default true;

alter table public.messages add column if not exists name text;

alter table public.appointments add column if not exists offer_id uuid references public.offers (id) on delete set null;

notify pgrst, 'reload schema';

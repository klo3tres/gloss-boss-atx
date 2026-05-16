-- Launch blocker polish: agreement CRM links, optional message column, site_settings review URL (additive only).

-- ---------- signed_agreements: CRM linkage ----------
alter table public.signed_agreements add column if not exists customer_id uuid references public.customers (id) on delete set null;
alter table public.signed_agreements add column if not exists vehicle_id uuid references public.vehicles (id) on delete set null;
alter table public.signed_agreements add column if not exists technician_id uuid references public.profiles (id) on delete set null;

create index if not exists idx_signed_agreements_customer on public.signed_agreements (customer_id);
create index if not exists idx_signed_agreements_technician on public.signed_agreements (technician_id);

-- ---------- job_agreements: optional CRM linkage ----------
alter table public.job_agreements add column if not exists customer_id uuid references public.customers (id) on delete set null;
alter table public.job_agreements add column if not exists vehicle_id uuid references public.vehicles (id) on delete set null;
alter table public.job_agreements add column if not exists technician_id uuid references public.profiles (id) on delete set null;

-- ---------- messages: resilient body alias ----------
alter table public.messages add column if not exists message text;

-- ---------- site_settings: Google review URL (JSON value) ----------
-- App reads key `google_review_url` with value like {"url":"https://maps.google.com/..."} or plain string in legacy setups.

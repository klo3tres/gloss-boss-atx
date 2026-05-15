-- Job agreements (parallel to signed_agreements for CRM stabilization) + CMS document registry.

create table if not exists public.job_agreements (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  signer_legal_name text not null,
  agreement_snapshot text not null,
  signature_type text check (signature_type in ('typed', 'drawn')),
  signature_data text,
  template_id uuid,
  template_version int,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_job_agreements_one_per_appt on public.job_agreements (appointment_id);

alter table public.job_agreements enable row level security;

drop policy if exists "job_agreements_staff" on public.job_agreements;
create policy "job_agreements_staff"
  on public.job_agreements
  for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "job_agreements_customer_read" on public.job_agreements;
create policy "job_agreements_customer_read"
  on public.job_agreements
  for select
  using (
    exists (
      select 1 from public.appointments a
      where a.id = job_agreements.appointment_id
        and (a.created_by = auth.uid() or exists (
          select 1 from public.customers c
          where c.id = a.customer_id and c.auth_user_id = auth.uid()
        ))
    )
  );

create table if not exists public.cms_documents (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('liability', 'sop', 'homepage_banner', 'other')),
  title text not null default '',
  file_url text not null,
  mime_type text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cms_documents_category on public.cms_documents (category, sort_order);

alter table public.cms_documents enable row level security;

drop policy if exists "cms_documents_staff" on public.cms_documents;
create policy "cms_documents_staff"
  on public.cms_documents
  for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "cms_documents_public_read_banners" on public.cms_documents;
create policy "cms_documents_public_read_banners"
  on public.cms_documents
  for select
  to anon, authenticated
  using (category = 'homepage_banner');

notify pgrst, 'reload schema';

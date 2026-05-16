alter table if exists public.tech_workflow_sessions
  add column if not exists before_photo_count integer not null default 0,
  add column if not exists after_photo_count integer not null default 0,
  add column if not exists last_photo_uploaded_at timestamptz;

alter table if exists public.job_media
  add column if not exists workflow_session_id uuid references public.tech_workflow_sessions(id) on delete set null;

alter table if exists public.job_photos
  add column if not exists workflow_session_id uuid references public.tech_workflow_sessions(id) on delete set null;

create index if not exists idx_tech_workflow_sessions_photo_counts
  on public.tech_workflow_sessions (technician_id, status, updated_at desc);

create index if not exists idx_job_media_workflow_session_id
  on public.job_media (workflow_session_id);

create index if not exists idx_job_photos_workflow_session_id
  on public.job_photos (workflow_session_id);

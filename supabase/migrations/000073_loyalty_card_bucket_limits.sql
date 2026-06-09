-- Keep loyalty card upload limits aligned with the admin upload form.
-- This is safe for already-created buckets and does not touch stored images.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'loyalty-cards',
  'loyalty-cards',
  true,
  12582912,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

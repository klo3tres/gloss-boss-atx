import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { isAdminLevel } from '@/lib/auth/roles';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { tryCreateServerSupabase } from '@/lib/supabase/server';
import { galleryInsertPayloadVariants, maxGallerySortFromRows } from '@/lib/gallery-normalize';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'upload';
}

export async function POST(request: Request) {
  const supabaseUser = await tryCreateServerSupabase();
  if (!supabaseUser) {
    return NextResponse.json({ error: 'Server session unavailable' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile, error: profErr } = await supabaseUser.from('profiles').select('role').eq('id', user.id).maybeSingle();
  let role = parseAppRole(profile?.role);
  if (profErr || !profile || profile.role == null || String(profile.role).trim() === '') {
    const em = (user.email ?? '').trim().toLowerCase();
    if (em === OWNER_LOGIN_EMAIL) {
      role = 'super_admin';
    }
  }
  if (!isAdminLevel(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: 'Upload requires SUPABASE_SERVICE_ROLE_KEY on the server.', code: 'MISSING_SERVICE_ROLE' },
      { status: 503 },
    );
  }

  const { data: buckets, error: bucketListErr } = await admin.storage.listBuckets();
  if (bucketListErr) {
    console.warn('[CRM_DEBUG]', 'gallery_storage_list_buckets', bucketListErr.message);
  }
  const galleryBucketReady = !bucketListErr && buckets?.some((b) => b.name === 'gallery');
  if (!galleryBucketReady) {
    return NextResponse.json(
      {
        error: 'Storage bucket not configured yet. Uploads are temporarily disabled.',
        code: 'BUCKET_MISSING',
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
  }
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }

  const caption = typeof form.get('caption') === 'string' ? String(form.get('caption')).trim() : '';
  const buf = Buffer.from(await file.arrayBuffer());
  const path = `cms/${user.id}/${randomUUID()}-${safeFileName(file.name)}`;

  const { error: upErr } = await admin.storage.from('gallery').upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) {
    const m = upErr.message ?? '';
    console.warn('[CRM_DEBUG]', 'gallery_storage_upload', m);
    if (/Bucket not found|bucket does not exist|not found/i.test(m)) {
      return NextResponse.json(
        {
          error:
            'Storage bucket "gallery" is missing in Supabase. Create the bucket (public read) or add image URLs manually in CMS.',
          code: 'BUCKET_MISSING',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: m }, { status: 500 });
  }

  const { data: pub } = admin.storage.from('gallery').getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const maxQ = await admin.from('gallery_images').select('*').limit(500);
  if (maxQ.error) {
    console.warn('[CRM_DEBUG]', 'gallery_max_sort', maxQ.error.message);
    return NextResponse.json({ error: 'Could not read gallery order.' }, { status: 500 });
  }
  const nextOrder = maxGallerySortFromRows(maxQ.data ?? []) + 1;

  const variants = galleryInsertPayloadVariants(publicUrl, caption, nextOrder);
  let row: { id: string; url?: string | null } | null = null;
  for (const payload of variants) {
    const { data, error: insErr } = await admin.from('gallery_images').insert(payload).select('id').maybeSingle();
    if (!insErr && data) {
      row = data as { id: string; url?: string | null };
      break;
    }
    if (insErr) console.warn('[CRM_DEBUG]', 'gallery_images_insert_try', insErr.message);
  }

  if (!row) {
    return NextResponse.json({ error: 'Could not save gallery row for this database schema.' }, { status: 500 });
  }

  revalidatePath('/admin/cms');
  revalidatePath('/');
  revalidatePath('/gallery');

  return NextResponse.json({ ok: true, id: row.id, url: row.url ?? publicUrl });
}

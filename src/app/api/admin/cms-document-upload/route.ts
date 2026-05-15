import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { isAdminLevel } from '@/lib/auth/roles';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { tryCreateServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/html',
  'text/plain',
]);

const DOC_CATEGORIES = new Set(['liability', 'sop', 'intake', 'homepage_banner', 'training', 'other']);

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'document';
}

function fileExtLower(name: string): string {
  const base = safeFileName(name);
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i + 1).toLowerCase() : '';
}

async function resolveBucket(admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>) {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) return { bucket: null as string | null, err: error.message };
  if (buckets?.some((b) => b.name === 'cms')) return { bucket: 'cms', err: null };
  if (buckets?.some((b) => b.name === 'gallery')) return { bucket: 'gallery', err: null };
  return { bucket: null, err: 'No cms or gallery storage bucket' };
}

export async function POST(request: Request) {
  try {
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

    const { data: profile } = await supabaseUser.from('profiles').select('role').eq('id', user.id).maybeSingle();
    let role = parseAppRole(profile?.role);
    if (!profile?.role && (user.email ?? '').trim().toLowerCase() === OWNER_LOGIN_EMAIL) {
      role = 'super_admin';
    }
    if (!isAdminLevel(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = tryCreateAdminSupabase();
    if (!admin) {
      return NextResponse.json({ error: 'Service role required for uploads' }, { status: 503 });
    }

    const { bucket, err: bucketErr } = await resolveBucket(admin);
    if (!bucket) {
      return NextResponse.json({ error: bucketErr ?? 'Storage not configured', code: 'BUCKET_MISSING' }, { status: 503 });
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
      return NextResponse.json({ error: 'File too large (max 15MB)' }, { status: 400 });
    }

    const mime = file.type || 'application/octet-stream';
    const ext = fileExtLower(file.name);
    const isJsxTemplate = ext === 'jsx' || ext === 'tsx';
    const isDocx =
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword';
    if (isDocx) {
      return NextResponse.json(
        { error: 'Word documents are not supported in-browser. Please upload PDF or HTML.' },
        { status: 400 },
      );
    }
    const mimeOk = ALLOWED.has(mime) || mime.startsWith('image/') || isJsxTemplate;
    if (!mimeOk) {
      return NextResponse.json({ error: 'Unsupported file type. Use PDF, HTML, images, or JSX/TSX as a template reference.' }, { status: 400 });
    }

    const categoryRaw = String(form.get('category') ?? 'other').trim();
    const category = DOC_CATEGORIES.has(categoryRaw) ? categoryRaw : 'other';
    const title = String(form.get('title') ?? file.name).trim().slice(0, 200) || file.name;

    const buf = Buffer.from(await file.arrayBuffer());
    const storageMime = isJsxTemplate ? 'text/plain' : mime;
    const prefix = bucket === 'gallery' ? 'documents' : 'uploads';
    const path = `${prefix}/${user.id}/${randomUUID()}-${safeFileName(file.name)}`;

    const { error: upErr } = await admin.storage.from(bucket).upload(path, buf, { contentType: storageMime, upsert: false });
    if (upErr) {
      console.warn('[cms-document-upload]', upErr.message);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { data: pub } = admin.storage.from(bucket).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    const maxQ = await admin.from('cms_documents').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const nextOrder =
      !maxQ.error && maxQ.data?.[0] && typeof (maxQ.data[0] as { sort_order?: number }).sort_order === 'number'
        ? Number((maxQ.data[0] as { sort_order: number }).sort_order) + 10
        : 10;

    const meta =
      isJsxTemplate ? { jsx_template_reference: true as const, original_extension: ext, note: 'Stored as plain text; never executed in-browser.' } : null;
    const baseRow: Record<string, unknown> = { category, title, file_url: publicUrl, mime_type: storageMime, sort_order: nextOrder };
    if (meta) baseRow.meta = meta;

    let insErr = (await admin.from('cms_documents').insert(baseRow)).error;
    if (insErr && /meta|jsonb|column/i.test(insErr.message)) {
      insErr = (await admin.from('cms_documents').insert({ category, title, file_url: publicUrl, mime_type: storageMime, sort_order: nextOrder })).error;
    }
    if (insErr && /category|check constraint|schema cache/i.test(insErr.message)) {
      const fallbackCat = category === 'intake' || category === 'training' ? 'other' : category;
      const fallback: Record<string, unknown> = { category: fallbackCat, title, file_url: publicUrl, mime_type: storageMime, sort_order: nextOrder };
      if (meta) fallback.meta = meta;
      insErr = (await admin.from('cms_documents').insert(fallback)).error;
      if (insErr && meta) {
        insErr = (await admin.from('cms_documents').insert({ category: fallbackCat, title, file_url: publicUrl, mime_type: storageMime, sort_order: nextOrder })).error;
      }
    }
    if (insErr && /mime_type|column/i.test(insErr.message)) {
      insErr = (await admin.from('cms_documents').insert({ category, title, file_url: publicUrl, sort_order: nextOrder })).error;
    }

    if (insErr) {
      console.warn('[cms-document-upload] db', insErr.message);
      return NextResponse.json(
        { error: `File uploaded but database row failed: ${insErr.message}. Run migrations 000014+ (meta: 000021).`, url: publicUrl },
        { status: 503 },
      );
    }

    revalidatePath('/admin/cms');
    revalidatePath('/tech');
    revalidatePath('/tech/resources');

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      title,
      category,
      jsxTemplateReference: Boolean(isJsxTemplate),
    });
  } catch (e) {
    console.warn('[cms-document-upload]', e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

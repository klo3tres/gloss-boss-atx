import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { isAdminLevel } from '@/lib/auth/roles';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { tryCreateServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);

const KEYS = new Set(['navbar_logo', 'homepage_logo']);

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'logo';
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
      return NextResponse.json({ error: 'Service role required' }, { status: 503 });
    }

    const form = await request.formData();
    const file = form.get('file');
    const settingKey = String(form.get('settingKey') ?? '').trim();
    if (!KEYS.has(settingKey)) {
      return NextResponse.json({ error: 'Invalid settingKey' }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Max 3MB' }, { status: 400 });
    }
    const mime = file.type || 'image/png';
    if (!ALLOWED.has(mime)) {
      return NextResponse.json({ error: 'Use PNG, JPG, WebP, or SVG' }, { status: 400 });
    }

    const { data: buckets } = await admin.storage.listBuckets();
    const bucket = buckets?.some((b) => b.name === 'cms')
      ? 'cms'
      : buckets?.some((b) => b.name === 'gallery')
        ? 'gallery'
        : null;
    if (!bucket) {
      return NextResponse.json({ error: 'Storage bucket missing', code: 'BUCKET_MISSING' }, { status: 503 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const path = `branding/${settingKey}/${randomUUID()}-${safeFileName(file.name)}`;
    const { error: upErr } = await admin.storage.from(bucket).upload(path, buf, { contentType: mime, upsert: true });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { data: pub } = admin.storage.from(bucket).getPublicUrl(path);
    const url = pub.publicUrl;
    const now = new Date().toISOString();

    const { error: setErr } = await admin.from('site_settings').upsert(
      { key: settingKey, value: url, updated_at: now },
      { onConflict: 'key' },
    );
    if (setErr) {
      return NextResponse.json({ error: setErr.message, url }, { status: 503 });
    }

    revalidatePath('/admin/cms');
    revalidatePath('/');
    return NextResponse.json({ ok: true, url, settingKey });
  } catch (e) {
    console.warn('[branding-upload]', e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

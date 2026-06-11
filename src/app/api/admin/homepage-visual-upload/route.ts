import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'homepage-visual';
}

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Upload requires SUPABASE_SERVICE_ROLE_KEY on the server.', code: 'MISSING_SERVICE_ROLE' },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: 'Choose an image file first.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'File too large. Use an image under 10MB.' }, { status: 400 });
  }
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ ok: false, error: 'Unsupported image type. Use JPG, PNG, WebP, or GIF.' }, { status: 400 });
  }

  const slot = String(form.get('slot') ?? 'homepage').trim().replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60) || 'homepage';
  const buf = Buffer.from(await file.arrayBuffer());
  const path = `homepage/${gate.userId}/${slot}/${randomUUID()}-${safeFileName(file.name)}`;

  const { error: upErr } = await admin.storage.from('gallery').upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) {
    return NextResponse.json(
      {
        ok: false,
        error: /Bucket not found|bucket does not exist|not found/i.test(upErr.message)
          ? 'Supabase Storage bucket "gallery" is missing. Create it as a public bucket, then upload again.'
          : upErr.message,
      },
      { status: 500 },
    );
  }

  const { data: pub } = admin.storage.from('gallery').getPublicUrl(path);
  revalidatePath('/admin/cms');
  revalidatePath('/');
  revalidatePath('/services');
  revalidatePath('/fleet');
  return NextResponse.json({ ok: true, url: pub.publicUrl });
}

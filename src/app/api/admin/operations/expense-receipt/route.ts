import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { tryCreateServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const MAX = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const supabaseUser = await tryCreateServerSupabase();
  if (!supabaseUser) return NextResponse.json({ error: 'No session' }, { status: 503 });
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabaseUser.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!isAdminLevel(profile?.role ?? null)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const form = await request.formData();
  const expenseId = String(form.get('expenseId') ?? '').trim();
  const file = form.get('file');
  if (!expenseId || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'expenseId and file required' }, { status: 400 });
  }
  if (file.size > MAX) return NextResponse.json({ error: 'Max 5MB' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const path = `expenses/${expenseId}/${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, '-')}`;
  const bucket = 'gallery';
  const { error: upErr } = await admin.storage.from(bucket).upload(path, buf, {
    contentType: file.type || 'application/octet-stream',
    upsert: true,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = admin.storage.from(bucket).getPublicUrl(path);
  const { error } = await admin
    .from('business_expenses')
    .update({ receipt_url: pub.publicUrl, receipt_storage_path: path })
    .eq('id', expenseId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath('/admin/operations');
  return NextResponse.json({ ok: true, url: pub.publicUrl });
}

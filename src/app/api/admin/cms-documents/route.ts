import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

const CATEGORIES = new Set(['liability', 'sop', 'intake', 'homepage_banner', 'training', 'other']);

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });
  }

  let body: { category?: string; title?: string; file_url?: string };
  try {
    body = (await request.json()) as { category?: string; title?: string; file_url?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const category = String(body.category ?? 'other').trim();
  const title = String(body.title ?? '').trim().slice(0, 200);
  const fileUrl = String(body.file_url ?? '').trim();
  if (!CATEGORIES.has(category) || !fileUrl) {
    return NextResponse.json({ ok: false, error: 'Category and file URL required' }, { status: 400 });
  }

  try {
    const maxQ = await admin.from('cms_documents').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const nextOrder =
      !maxQ.error && maxQ.data?.[0] && typeof (maxQ.data[0] as { sort_order?: number }).sort_order === 'number'
        ? Number((maxQ.data[0] as { sort_order: number }).sort_order) + 10
        : 10;

    const mime = fileUrl.toLowerCase().endsWith('.pdf')
      ? 'application/pdf'
      : fileUrl.toLowerCase().endsWith('.html')
        ? 'text/html'
        : 'application/octet-stream';

    let ins = await admin.from('cms_documents').insert({
      category,
      title: title || category,
      file_url: fileUrl,
      mime_type: mime,
      sort_order: nextOrder,
    });
    if (ins.error && /category|check constraint|schema cache/i.test(ins.error.message)) {
      const fbCat = category === 'intake' || category === 'training' ? 'other' : category;
      ins = await admin.from('cms_documents').insert({
        category: fbCat,
        title: title || category,
        file_url: fileUrl,
        mime_type: mime,
        sort_order: nextOrder,
      });
    }
    if (ins.error && /mime_type|column/i.test(ins.error.message)) {
      ins = await admin.from('cms_documents').insert({
        category,
        title: title || category,
        file_url: fileUrl,
        sort_order: nextOrder,
      });
    }
    if (ins.error) {
      return NextResponse.json({ ok: false, error: ins.error.message }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Save failed' }, { status: 400 });
  }

  revalidatePath('/admin/cms');
  revalidatePath('/tech/resources');
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const id = String(searchParams.get('id') ?? '').trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
  }
  await admin.from('cms_documents').delete().eq('id', id);
  revalidatePath('/admin/cms');
  revalidatePath('/tech/resources');
  return NextResponse.json({ ok: true });
}

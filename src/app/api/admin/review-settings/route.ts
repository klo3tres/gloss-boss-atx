import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });
  }
  let body: { reviewUrl?: string };
  try {
    body = (await request.json()) as { reviewUrl?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const reviewUrl = String(body.reviewUrl ?? '').trim();
  const value = { review_url: reviewUrl };
  const { data: existing } = await admin.from('review_settings').select('id').eq('key', 'google_business').maybeSingle();
  if (existing?.id) {
    const { error } = await admin.from('review_settings').update({ value, updated_at: new Date().toISOString() }).eq('id', existing.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  } else {
    const { error } = await admin.from('review_settings').insert({ key: 'google_business', value });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  revalidatePath('/admin/cms');
  revalidatePath('/');
  return NextResponse.json({ ok: true });
}

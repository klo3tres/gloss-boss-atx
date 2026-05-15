import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { dbSaveFeaturedShowcase } from '@/lib/admin/gallery-db-mutations';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const json = typeof body === 'object' && body !== null && 'json' in body ? String((body as { json?: unknown }).json ?? '') : '';
  if (!json.trim()) {
    return NextResponse.json({ ok: false, error: 'Missing json' }, { status: 400 });
  }

  const writeClient = tryCreateAdminSupabase() ?? gate.supabase;
  const res = await dbSaveFeaturedShowcase(writeClient, json);
  if (!res.ok) {
    const status = res.code === 'TABLE_OR_POLICY' ? 503 : 400;
    return NextResponse.json({ ok: false, error: res.error ?? 'Save failed', code: res.code }, { status });
  }

  revalidatePath('/');
  revalidatePath('/admin/cms');
  revalidatePath('/services');
  revalidatePath('/gallery');
  return NextResponse.json({ ok: true });
}
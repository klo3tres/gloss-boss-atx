import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

const TABLES = new Set(['job_media', 'job_photos']);
const PHASES = new Set(['before', 'after']);
const TYPES = new Set(['before', 'after', 'interior', 'exterior', 'damage', 'wheel', 'wheels', 'product', 'process', 'front', 'rear', 'driver_side', 'passenger_side', 'roof', 'existing_damage', 'other']);

function clean(v: unknown) {
  return String(v ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

async function safeUpdate(client: any, table: string, id: string, patch: Record<string, unknown>) {
  const { error } = await client.from(table).update(patch).eq('id', id);
  return error;
}

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  let body: { id?: string; table?: string; phase?: string; photoType?: string };
  try {
    body = (await request.json()) as { id?: string; table?: string; phase?: string; photoType?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const id = String(body.id ?? '').trim();
  const table = clean(body.table);
  const phase = clean(body.phase);
  const photoTypeRaw = clean(body.photoType);
  const photoType = photoTypeRaw === 'wheel' ? 'wheels' : photoTypeRaw;

  if (!id || !TABLES.has(table)) {
    return NextResponse.json({ ok: false, error: 'Missing photo id or table.' }, { status: 400 });
  }
  if (!PHASES.has(phase)) {
    return NextResponse.json({ ok: false, error: 'Choose before or after.' }, { status: 400 });
  }
  if (!TYPES.has(photoType)) {
    return NextResponse.json({ ok: false, error: 'Choose a valid photo type.' }, { status: 400 });
  }

  const client = tryCreateAdminSupabase() ?? gate.supabase;
  const richPatch = { category: phase, photo_category: photoType, photo_type: photoType };
  let err = await safeUpdate(client, table, id, richPatch);
  if (err && /photo_category|photo_type|schema cache|Could not find|column/i.test(err.message)) {
    err = await safeUpdate(client, table, id, { category: phase, photo_category: photoType });
  }
  if (err && /photo_category|schema cache|Could not find|column/i.test(err.message)) {
    err = await safeUpdate(client, table, id, { category: phase });
  }
  if (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }

  revalidatePath('/admin/cms');
  revalidatePath('/gallery');
  revalidatePath('/');
  return NextResponse.json({ ok: true });
}

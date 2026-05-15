import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });

  let body: { label?: string; slug?: string; price_cents?: number; active?: boolean; sort_order?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const label = String(body.label ?? '').trim().slice(0, 160);
  if (!label) return NextResponse.json({ ok: false, error: 'Label required' }, { status: 400 });
  const slug = String(body.slug ?? '').trim() ? slugify(String(body.slug)) : slugify(label);
  const price_cents = Math.max(0, Math.round(Number(body.price_cents ?? 0)));
  const active = body.active !== false;
  const sort_order = typeof body.sort_order === 'number' && !Number.isNaN(body.sort_order) ? body.sort_order : 100;

  const { error } = await admin.from('addons').insert({ slug, label, price_cents, active, sort_order });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  revalidatePath('/admin/addons');
  revalidatePath('/book');
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });

  let body: {
    id?: string;
    label?: string;
    slug?: string;
    price_cents?: number;
    active?: boolean;
    sort_order?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.label === 'string') patch.label = body.label.trim().slice(0, 160);
  if (typeof body.slug === 'string' && body.slug.trim()) patch.slug = slugify(body.slug);
  if (typeof body.price_cents === 'number' && !Number.isNaN(body.price_cents)) patch.price_cents = Math.max(0, Math.round(body.price_cents));
  if (typeof body.active === 'boolean') patch.active = body.active;
  if (typeof body.sort_order === 'number' && !Number.isNaN(body.sort_order)) patch.sort_order = body.sort_order;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'No changes' }, { status: 400 });
  }

  const { error } = await admin.from('addons').update(patch).eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  revalidatePath('/admin/addons');
  revalidatePath('/book');
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });
  const id = new URL(request.url).searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
  const { error } = await admin.from('addons').delete().eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  revalidatePath('/admin/addons');
  revalidatePath('/book');
  return NextResponse.json({ ok: true });
}

import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

type Body = {
  id?: string;
  label: string;
  percent_off: number;
  active: boolean;
  stackable?: boolean;
};

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const id = String(body.id ?? '').trim();
  const label = String(body.label ?? '').trim().slice(0, 120);
  const percent = Math.min(100, Math.max(0, Number(body.percent_off ?? 0)));
  const active = Boolean(body.active);
  const stackable = body.stackable !== false;

  if (!label) {
    return NextResponse.json({ ok: false, error: 'Offer title required' }, { status: 400 });
  }

  try {
    if (id) {
      const payloads = [
        { label, percent_off: percent, discount_percent: percent, active, title: label, stackable },
        { label, percent_off: percent, discount_percent: percent, active, stackable },
        { label, percent_off: percent, active, stackable },
      ];
      let lastErr: string | null = null;
      for (const p of payloads) {
        const { error } = await admin.from('offers').update(p).eq('id', id);
        if (!error) {
          revalidatePath('/admin/cms');
          revalidatePath('/services');
          revalidatePath('/book');
          revalidatePath('/');
          return NextResponse.json({ ok: true });
        }
        lastErr = error.message;
      }
      return NextResponse.json({ ok: false, error: lastErr ?? 'Update failed' }, { status: 400 });
    }

    const maxQ = await admin.from('offers').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const sort_order =
      !maxQ.error && maxQ.data?.[0] && typeof (maxQ.data[0] as { sort_order?: number }).sort_order === 'number'
        ? Number((maxQ.data[0] as { sort_order: number }).sort_order) + 10
        : 10;

    const inserts = [
      { label, title: label, percent_off: percent, discount_percent: percent, active, sort_order, stackable },
      { label, percent_off: percent, discount_percent: percent, active, sort_order },
      { label, percent_off: percent, active, sort_order },
    ];
    for (const p of inserts) {
      const { error } = await admin.from('offers').insert(p);
      if (!error) {
        revalidatePath('/admin/cms');
        revalidatePath('/services');
        revalidatePath('/book');
        revalidatePath('/');
        return NextResponse.json({ ok: true });
      }
    }
    return NextResponse.json({ ok: false, error: 'Could not create offer' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Offer save failed' }, { status: 400 });
  }
}

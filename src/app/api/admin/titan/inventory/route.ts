import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function PATCH(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });

  let body: { id?: string; quantity_on_hand?: number; reorder_threshold?: number; reorder_quantity?: number; notes?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.quantity_on_hand === 'number' && !Number.isNaN(body.quantity_on_hand)) {
    patch.quantity_on_hand = Math.max(0, body.quantity_on_hand);
  }
  if (typeof body.reorder_threshold === 'number' && !Number.isNaN(body.reorder_threshold)) {
    patch.reorder_threshold = Math.max(0, body.reorder_threshold);
  }
  if (typeof body.reorder_quantity === 'number' && !Number.isNaN(body.reorder_quantity)) {
    patch.reorder_quantity = Math.max(0, body.reorder_quantity);
  }
  if (typeof body.notes === 'string') patch.notes = body.notes.slice(0, 500);

  const { error } = await admin.from('titan_inventory_items').update(patch).eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  revalidatePath('/admin/titan/inventory');
  return NextResponse.json({ ok: true });
}

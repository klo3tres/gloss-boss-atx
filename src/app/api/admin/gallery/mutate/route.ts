import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import {
  dbDeleteGalleryImage,
  dbReorderGalleryBulk,
  dbReorderGalleryStep,
  dbToggleGalleryFeatured,
  dbToggleGalleryPublished,
} from '@/lib/admin/gallery-db-mutations';

export const runtime = 'nodejs';

type Body = {
  op: 'toggle-published' | 'toggle-featured' | 'delete' | 'reorder' | 'reorder-step';
  id?: string;
  published?: boolean;
  featured?: boolean;
  order?: string[];
  direction?: 'up' | 'down';
};

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const { supabase } = gate;

  let res: { ok: boolean; error?: string } = { ok: false, error: 'Unknown op' };
  switch (body.op) {
    case 'toggle-published': {
      const id = String(body.id ?? '').trim();
      if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
      res = await dbToggleGalleryPublished(supabase, id, Boolean(body.published));
      break;
    }
    case 'toggle-featured': {
      const id = String(body.id ?? '').trim();
      if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
      res = await dbToggleGalleryFeatured(supabase, id, Boolean(body.featured));
      break;
    }
    case 'delete': {
      const id = String(body.id ?? '').trim();
      if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
      res = await dbDeleteGalleryImage(supabase, id);
      break;
    }
    case 'reorder': {
      const order = Array.isArray(body.order) ? body.order.map((s) => String(s).trim()).filter(Boolean) : [];
      res = await dbReorderGalleryBulk(supabase, order);
      break;
    }
    case 'reorder-step': {
      const id = String(body.id ?? '').trim();
      const direction = body.direction === 'up' || body.direction === 'down' ? body.direction : null;
      if (!id || !direction) return NextResponse.json({ ok: false, error: 'Invalid reorder-step' }, { status: 400 });
      res = await dbReorderGalleryStep(supabase, id, direction);
      break;
    }
    default:
      return NextResponse.json({ ok: false, error: 'Invalid op' }, { status: 400 });
  }

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error ?? 'Failed' }, { status: 400 });
  }
  revalidatePath('/admin/cms');
  revalidatePath('/');
  revalidatePath('/gallery');
  revalidatePath('/book');
  return NextResponse.json({ ok: true });
}

import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import {
  dbCreateBeforeAfterPost,
  dbDeleteGalleryImage,
  dbReorderGalleryBulk,
  dbReorderGalleryStep,
  dbToggleGalleryFeatured,
  dbToggleGalleryPublished,
  dbUpdateGalleryCaption,
  dbUpdateGalleryFields,
} from '@/lib/admin/gallery-db-mutations';

export const runtime = 'nodejs';

type Body = {
  op: 'toggle-published' | 'toggle-featured' | 'delete' | 'reorder' | 'reorder-step' | 'updateCaption' | 'create-before-after' | 'updateFields';
  id?: string;
  caption?: string;
  published?: boolean;
  featured?: boolean;
  order?: string[];
  direction?: 'up' | 'down';
  beforeUrl?: string;
  afterUrl?: string;
  vehicleLabel?: string;
  serviceLabel?: string;
  watermark?: boolean;
  transformationPhase?: string;
  jobId?: string;
  vehicleClass?: string;
  serviceCategory?: string;
  destination?: string;
  tags?: string | string[];
  publicCaption?: string;
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
    case 'updateCaption': {
      const id = String(body.id ?? '').trim();
      const caption = String(body.caption ?? '');
      if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
      res = await dbUpdateGalleryCaption(supabase, id, caption);
      break;
    }
    case 'reorder-step': {
      const id = String(body.id ?? '').trim();
      const direction = body.direction === 'up' || body.direction === 'down' ? body.direction : null;
      if (!id || !direction) return NextResponse.json({ ok: false, error: 'Invalid reorder-step' }, { status: 400 });
      res = await dbReorderGalleryStep(supabase, id, direction);
      break;
    }
    case 'create-before-after': {
      const beforeUrl = String(body.beforeUrl ?? '').trim();
      const afterUrl = String(body.afterUrl ?? '').trim();
      const vehicleLabel = String(body.vehicleLabel ?? '').trim();
      const serviceLabel = String(body.serviceLabel ?? '').trim();
      const caption = String(body.caption ?? '').trim();
      const watermark = Boolean(body.watermark);
      const published = Boolean(body.published ?? true);
      const jobId = body.jobId ? String(body.jobId).trim() : undefined;
      let vehicleClass = body.vehicleClass ? String(body.vehicleClass).trim() : undefined;
      const serviceCategory = body.serviceCategory ? String(body.serviceCategory).trim() : undefined;
      const destination = body.destination ? String(body.destination).trim() : undefined;
      const publicCaption = body.publicCaption ? String(body.publicCaption).trim() : undefined;
      const tags = Array.isArray(body.tags)
        ? body.tags.map((tag) => String(tag).trim()).filter(Boolean)
        : String(body.tags ?? '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);

      if (!beforeUrl || !afterUrl || !vehicleLabel || !serviceLabel || !caption) {
        return NextResponse.json({ ok: false, error: 'Missing required fields for post' }, { status: 400 });
      }

      if (!vehicleClass && jobId) {
        // Fallback: Resolve vehicle_class from appointments
        const { data: appt } = await supabase
          .from('appointments')
          .select('vehicle_class')
          .eq('id', jobId)
          .maybeSingle();

        if (appt?.vehicle_class) {
          vehicleClass = appt.vehicle_class;
        } else {
          // Fallback: Resolve vehicle_class from booking_fallbacks
          const { data: fallback } = await supabase
            .from('booking_fallbacks')
            .select('vehicle_class')
            .eq('id', jobId)
            .maybeSingle();

          if (fallback?.vehicle_class) {
            vehicleClass = fallback.vehicle_class;
          }
        }
      }

      res = await dbCreateBeforeAfterPost(supabase, {
        beforeUrl,
        afterUrl,
        vehicleLabel,
        serviceLabel,
        caption,
        watermark,
        published,
        jobId,
        vehicleClass,
        serviceCategory,
        destination,
        tags,
        publicCaption,
      });
      break;
    }
    case 'updateFields': {
      const id = String(body.id ?? '').trim();
      if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
      res = await dbUpdateGalleryFields(supabase, id, {
        caption: body.caption,
        vehicleLabel: body.vehicleLabel,
        serviceLabel: body.serviceLabel,
        transformationPhase: body.transformationPhase,
        watermark: body.watermark,
        published: body.published,
        featured: body.featured,
      });
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

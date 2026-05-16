import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import { recordJobTimelineEvent } from '@/lib/job-timeline-server';
import { tryCreateServerSupabase } from '@/lib/supabase/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const FINE_CATEGORIES = new Set([
  'front',
  'rear',
  'driver_side',
  'passenger_side',
  'interior',
  'wheels',
  'damage',
  'before',
  'after',
]);

function broadCategory(fine: string): 'inspection' | 'before' | 'after' | 'damage' | 'other' {
  if (fine === 'before') return 'before';
  if (fine === 'after') return 'after';
  if (fine === 'damage') return 'damage';
  if (FINE_CATEGORIES.has(fine)) return 'inspection';
  return 'other';
}

function isFieldTechRole(role: string | null): boolean {
  return role === 'technician' || role === 'admin' || role === 'super_admin';
}

export async function POST(request: Request) {
  try {
    const supabase = await tryCreateServerSupabase();
    const admin = tryCreateAdminSupabase();
    if (!supabase || !admin) {
      return NextResponse.json({ error: 'Server storage is not configured.' }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    let role = parseAppRole(profile?.role);
    if (!profile?.role && (user.email ?? '').trim().toLowerCase() === OWNER_LOGIN_EMAIL) role = 'super_admin';
    if (!isFieldTechRole(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const form = await request.formData();
    const file = form.get('file');
    const appointmentId = String(form.get('appointmentId') ?? '').trim();
    const fallbackBookingId = String(form.get('fallbackBookingId') ?? '').trim();
    const rawCat = String(form.get('photoCategory') ?? form.get('category') ?? 'before')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    const photoCategory = FINE_CATEGORIES.has(rawCat) ? rawCat : 'before';
    const category = broadCategory(photoCategory);

    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image file.' }, { status: 400 });
    if (!MIME_TO_EXT[file.type]) {
      return NextResponse.json({ error: 'Use JPEG, PNG, or WEBP images only.' }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be 12MB or smaller.' }, { status: 400 });
    }
    if (!appointmentId && !fallbackBookingId) {
      return NextResponse.json({ error: 'Missing job reference.' }, { status: 400 });
    }

    let customerId: string | null = null;
    let vehicleId: string | null = null;

    if (appointmentId) {
      const { data: appt, error } = await admin
        .from('appointments')
        .select('id, assigned_technician_id, customer_id, vehicle_id, booking_source')
        .eq('id', appointmentId)
        .maybeSingle();
      const a = appt as Record<string, unknown> | null;
      if (error || !a) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
      const assigned = typeof a.assigned_technician_id === 'string' ? a.assigned_technician_id : null;
      if (assigned !== user.id) {
        const isWalkIn = String(a.booking_source ?? '') === 'tech_workflow';
        if (isWalkIn && !assigned) {
          await admin
            .from('appointments')
            .update({ assigned_technician_id: user.id, assigned_by: user.id, assigned_at: new Date().toISOString() })
            .eq('id', appointmentId);
        } else if (role !== 'admin' && role !== 'super_admin') {
          return NextResponse.json({ error: 'Invalid appointment for this technician.' }, { status: 400 });
        }
      }
      customerId = typeof a.customer_id === 'string' ? a.customer_id : null;
      vehicleId = typeof a.vehicle_id === 'string' ? a.vehicle_id : null;
    }

    if (fallbackBookingId) {
      const { data: fb, error } = await admin
        .from('booking_fallbacks')
        .select('id, assigned_technician_id')
        .eq('id', fallbackBookingId)
        .maybeSingle();
      const f = fb as Record<string, unknown> | null;
      if (error || !f) return NextResponse.json({ error: 'Fallback booking not found.' }, { status: 404 });
      const assigned = typeof f.assigned_technician_id === 'string' ? f.assigned_technician_id : null;
      if (assigned && assigned !== user.id && role !== 'admin' && role !== 'super_admin') {
        return NextResponse.json({ error: 'Invalid fallback for this technician.' }, { status: 400 });
      }
    }

    const ext = MIME_TO_EXT[file.type];
    const bucket = process.env.JOB_MEDIA_BUCKET?.trim() || 'job-media';
    const path = `${user.id}/${appointmentId || `fallback-${fallbackBookingId}`}/${Date.now()}-${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage.from(bucket).upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      return NextResponse.json(
        { error: `Photo storage failed: ${uploadError.message}. Create a Supabase bucket named "${bucket}".` },
        { status: 500 },
      );
    }

    const { data: pub } = admin.storage.from(bucket).getPublicUrl(path);
    const fileUrl = pub.publicUrl;

    const baseRow: Record<string, unknown> = {
      appointment_id: appointmentId || null,
      fallback_booking_id: fallbackBookingId || null,
      customer_id: customerId,
      vehicle_id: vehicleId,
      technician_id: user.id,
      uploaded_by: user.id,
      category,
      photo_category: photoCategory,
      file_url: fileUrl,
      storage_bucket: bucket,
      storage_path: path,
      mime_type: file.type,
      file_size_bytes: file.size,
      visible_to_customer: false,
      approved_for_customer: false,
    };

    if (appointmentId) {
      let ins = await admin.from('job_media').insert(baseRow).select('id').maybeSingle();
      if (ins.error && isSchemaDriftError(ins.error.message)) {
        ins = await admin
          .from('job_media')
          .insert({
            appointment_id: appointmentId,
            uploaded_by: user.id,
            category,
            file_url: fileUrl,
          })
          .select('id')
          .maybeSingle();
      }
      if (ins.error) console.warn('[job-media-upload] job_media insert', ins.error.message);
    }

    const photoRow = { ...baseRow };
    delete photoRow.uploaded_by;
    let photoIns = await admin.from('job_photos').insert(photoRow).select('id').maybeSingle();
    if (photoIns.error && isSchemaDriftError(photoIns.error.message)) {
      photoIns = await admin
        .from('job_photos')
        .insert({
          appointment_id: appointmentId || null,
          fallback_booking_id: fallbackBookingId || null,
          technician_id: user.id,
          category,
          file_url: fileUrl,
        })
        .select('id')
        .maybeSingle();
    }
    if (photoIns.error) console.warn('[job-media-upload] job_photos insert', photoIns.error.message);

    if (appointmentId) {
      await recordJobTimelineEvent(admin, {
        appointmentId,
        eventType: category === 'before' ? 'photo_before' : category === 'after' ? 'photo_after' : category === 'damage' ? 'photo_damage' : 'photo_inspection',
        meta: { category, photo_category: photoCategory, file_url: fileUrl },
        createdBy: user.id,
      });
    }

    return NextResponse.json({ ok: true, url: fileUrl, category, photoCategory });
  } catch (e) {
    console.warn('[job-media-upload]', e);
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
  }
}

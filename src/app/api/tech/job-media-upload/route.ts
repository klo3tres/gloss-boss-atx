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
  'other',
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    let fallbackBookingId = String(form.get('fallbackBookingId') ?? '').trim();
    const techWorkflowId = String(form.get('techWorkflowId') ?? '').trim();
    const accessToken = String(form.get('accessToken') ?? '').trim();
    const jobReference = String(form.get('jobReference') ?? '').trim();
    const rawCat = String(form.get('photoCategory') ?? 'other')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    const photoCategory = FINE_CATEGORIES.has(rawCat) ? rawCat : 'other';
    const rawBroad = String(form.get('category') ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    const category =
      rawBroad === 'before' || rawBroad === 'after' || rawBroad === 'damage' || rawBroad === 'inspection' || rawBroad === 'other'
        ? rawBroad
        : broadCategory(photoCategory);

    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image file.' }, { status: 400 });
    if (!MIME_TO_EXT[file.type]) {
      return NextResponse.json({ error: 'Use JPEG, PNG, or WEBP images only.' }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be 12MB or smaller.' }, { status: 400 });
    }
    if (!appointmentId && !fallbackBookingId && !techWorkflowId && !accessToken && !jobReference) {
      return NextResponse.json({ error: 'Missing job reference.' }, { status: 400 });
    }

    let customerId: string | null = null;
    let vehicleId: string | null = null;
    const debug: Array<Record<string, unknown>> = [];
    const logDebug = (event: string, extra: Record<string, unknown> = {}) => {
      debug.push({ event, ...extra });
    };
    logDebug('received', {
      appointmentId,
      fallbackBookingId,
      techWorkflowId,
      accessToken: accessToken ? `${accessToken.slice(0, 8)}...` : null,
      jobReference: jobReference ? `${jobReference.slice(0, 8)}...` : null,
      userId: user.id,
    });

    let appointmentUsable = Boolean(appointmentId);
    let linkedAppointmentId = appointmentId;
    if (appointmentId) {
      const { data: appt, error } = await admin
        .from('appointments')
        .select('id, assigned_technician_id, customer_id, vehicle_id, booking_source')
        .eq('id', appointmentId)
        .maybeSingle();
      const a = appt as Record<string, unknown> | null;
      logDebug('appointments.by_id', { found: Boolean(a), error: error?.message ?? null });
      if (error || !a) {
        appointmentUsable = false;
      } else {
        const assigned = typeof a.assigned_technician_id === 'string' ? a.assigned_technician_id : null;
        const assignmentMatch = assigned === user.id;
        logDebug('appointments.assignment', { assigned, assignmentMatch, bookingSource: a.booking_source ?? null });
        if (!assignmentMatch) {
          const isWalkIn = String(a.booking_source ?? '') === 'tech_workflow';
          if (isWalkIn && !assigned) {
            await admin
              .from('appointments')
              .update({ assigned_technician_id: user.id, assigned_by: user.id, assigned_at: new Date().toISOString() })
              .eq('id', appointmentId);
            logDebug('appointments.assignment_repaired', { repaired: true });
          } else if (role !== 'admin' && role !== 'super_admin') {
            console.warn('[job-media-upload] lookup denied', debug);
            return NextResponse.json({ error: 'Invalid appointment for this technician.' }, { status: 400 });
          }
        }
        customerId = typeof a.customer_id === 'string' ? a.customer_id : null;
        vehicleId = typeof a.vehicle_id === 'string' ? a.vehicle_id : null;
      }
    }

    if (!appointmentUsable) {
      const refs = [accessToken, jobReference, techWorkflowId, appointmentId].filter(Boolean);
      for (const ref of refs) {
        const byToken = await admin
          .from('appointments')
          .select('id, assigned_technician_id, customer_id, vehicle_id, booking_source')
          .eq('access_token', ref)
          .maybeSingle();
        logDebug('appointments.by_access_token', { ref: `${ref.slice(0, 8)}...`, found: Boolean(byToken.data), error: byToken.error?.message ?? null });
        const a = byToken.data as Record<string, unknown> | null;
        if (!byToken.error && a?.id) {
          appointmentUsable = true;
          const resolvedAppointmentId = String(a.id);
          linkedAppointmentId = resolvedAppointmentId;
          const assigned = typeof a.assigned_technician_id === 'string' ? a.assigned_technician_id : null;
          if (assigned !== user.id && String(a.booking_source ?? '') === 'tech_workflow' && !assigned) {
            await admin
              .from('appointments')
              .update({ assigned_technician_id: user.id, assigned_by: user.id, assigned_at: new Date().toISOString() })
              .eq('id', resolvedAppointmentId);
          } else if (assigned !== user.id && role !== 'admin' && role !== 'super_admin') {
            console.warn('[job-media-upload] lookup denied', debug);
            return NextResponse.json({ error: 'Invalid appointment for this technician.' }, { status: 400 });
          }
          customerId = typeof a.customer_id === 'string' ? a.customer_id : null;
          vehicleId = typeof a.vehicle_id === 'string' ? a.vehicle_id : null;
          logDebug('appointments.resolved_by_access_token', { appointmentId: resolvedAppointmentId });
          break;
        }
      }
    }

    if (fallbackBookingId) {
      const { data: fb, error } = await admin
        .from('booking_fallbacks')
        .select('id, assigned_technician_id')
        .eq('id', fallbackBookingId)
        .maybeSingle();
      const f = fb as Record<string, unknown> | null;
      logDebug('booking_fallbacks.by_id', { found: Boolean(f), error: error?.message ?? null });
      if (error || !f) {
        fallbackBookingId = '';
      } else {
      const assigned = typeof f.assigned_technician_id === 'string' ? f.assigned_technician_id : null;
      if (assigned && assigned !== user.id && role !== 'admin' && role !== 'super_admin') {
        console.warn('[job-media-upload] fallback assignment denied', debug);
        return NextResponse.json({ error: 'Invalid fallback for this technician.' }, { status: 400 });
      }
      }
    }

    if (!appointmentUsable && !fallbackBookingId) {
      const refs = [techWorkflowId, jobReference, accessToken, appointmentId].filter(Boolean);
      for (const ref of refs) {
        if (UUID_RE.test(ref)) {
          const byId = await admin
            .from('booking_fallbacks')
            .select('id, assigned_technician_id')
            .eq('id', ref)
            .maybeSingle();
          logDebug('booking_fallbacks.by_id_ref', { ref: `${ref.slice(0, 8)}...`, found: Boolean(byId.data), error: byId.error?.message ?? null });
          if (!byId.error && byId.data?.id) {
            fallbackBookingId = String(byId.data.id);
            break;
          }
        }
        const byToken = await admin
          .from('booking_fallbacks')
          .select('id, assigned_technician_id')
          .eq('access_token', ref)
          .maybeSingle();
        logDebug('booking_fallbacks.by_access_token', { ref: `${ref.slice(0, 8)}...`, found: Boolean(byToken.data), error: byToken.error?.message ?? null });
        if (!byToken.error && byToken.data?.id) {
          fallbackBookingId = String(byToken.data.id);
          break;
        }
      }
    }

    if (!appointmentUsable && fallbackBookingId) {
      const fbCheck = await admin
        .from('booking_fallbacks')
        .select('id, assigned_technician_id')
        .eq('id', fallbackBookingId)
        .maybeSingle();
      const f = fbCheck.data as Record<string, unknown> | null;
      logDebug('booking_fallbacks.final', { found: Boolean(f), error: fbCheck.error?.message ?? null });
      if (fbCheck.error || !f) {
        console.warn('[job-media-upload] resolved fallback missing', debug);
        return NextResponse.json({ error: 'Fallback booking not found.' }, { status: 404 });
      }
      const assigned = typeof f.assigned_technician_id === 'string' ? f.assigned_technician_id : null;
      if (assigned && assigned !== user.id && role !== 'admin' && role !== 'super_admin') {
        console.warn('[job-media-upload] resolved fallback denied', debug);
        return NextResponse.json({ error: 'Invalid fallback for this technician.' }, { status: 400 });
      }
    }

    if (!appointmentUsable && !fallbackBookingId) {
      console.warn('[job-media-upload] no workflow job/fallback found', debug);
      return NextResponse.json(
        {
          error:
            'Could not find the active workflow job. Go back to Quote total and tap Create job & continue, then retry the upload.',
        },
        { status: 404 },
      );
    }

    const ext = MIME_TO_EXT[file.type];
    const bucket = process.env.JOB_MEDIA_BUCKET?.trim() || 'job-media';
    linkedAppointmentId = appointmentUsable ? linkedAppointmentId : '';
    const path = `${user.id}/${linkedAppointmentId || `fallback-${fallbackBookingId}`}/${Date.now()}-${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    let { error: uploadError } = await admin.storage.from(bucket).upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError && /bucket|not found|does not exist/i.test(uploadError.message)) {
      await admin.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 12 * 1024 * 1024,
        allowedMimeTypes: Object.keys(MIME_TO_EXT),
      });
      ({ error: uploadError } = await admin.storage.from(bucket).upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      }));
    }
    if (uploadError) {
      return NextResponse.json(
        { error: `Photo storage failed: ${uploadError.message}. Create a Supabase bucket named "${bucket}".` },
        { status: 500 },
      );
    }

    const { data: pub } = admin.storage.from(bucket).getPublicUrl(path);
    const fileUrl = pub.publicUrl;

    const baseRow: Record<string, unknown> = {
      appointment_id: linkedAppointmentId || null,
      fallback_booking_id: fallbackBookingId || null,
      customer_id: customerId,
      vehicle_id: vehicleId,
      technician_id: user.id,
      uploaded_by: user.id,
      category,
      photo_category: photoCategory,
      file_url: fileUrl,
      media_url: fileUrl,
      public_url: fileUrl,
      storage_bucket: bucket,
      storage_path: path,
      file_path: path,
      mime_type: file.type,
      content_type: file.type,
      file_size_bytes: file.size,
      file_size: file.size,
      visible_to_customer: false,
      approved_for_customer: false,
      publish_to_gallery: false,
      published_to_gallery: false,
    };

    if (linkedAppointmentId) {
      let ins = await admin.from('job_media').insert(baseRow).select('id').maybeSingle();
      if (ins.error && isSchemaDriftError(ins.error.message)) {
        ins = await admin
          .from('job_media')
          .insert({
            appointment_id: linkedAppointmentId,
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
          appointment_id: linkedAppointmentId || null,
          fallback_booking_id: fallbackBookingId || null,
          technician_id: user.id,
          category,
          file_url: fileUrl,
        })
        .select('id')
        .maybeSingle();
    }
    if (photoIns.error) console.warn('[job-media-upload] job_photos insert', photoIns.error.message);

    if (linkedAppointmentId) {
      await recordJobTimelineEvent(admin, {
        appointmentId: linkedAppointmentId,
        eventType: category === 'before' ? 'photo_before' : category === 'after' ? 'photo_after' : category === 'damage' ? 'photo_damage' : 'photo_inspection',
        meta: { category, photo_category: photoCategory, file_url: fileUrl },
        createdBy: user.id,
      });
    }

    logDebug('saved', {
      linkedAppointmentId: linkedAppointmentId || null,
      fallbackBookingId: fallbackBookingId || null,
      category,
      photoCategory,
    });
    console.info('[job-media-upload] debug', debug);

    return NextResponse.json({
      ok: true,
      url: fileUrl,
      category,
      photoCategory,
      savedTo: linkedAppointmentId ? 'appointment' : 'fallback',
      uploadedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[job-media-upload]', e);
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
  }
}

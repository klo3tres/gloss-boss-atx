import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { canAccessCustomerPortal } from '@/lib/auth/customer-portal';
import { resolveAuthenticatedCustomer } from '@/lib/customer-account';
import { recordJobTimelineEvent } from '@/lib/job-timeline-server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/heic', 'heic'],
  ['image/heif', 'heif'],
]);

function str(value: unknown) {
  return value == null ? '' : String(value).trim();
}

export async function POST(request: Request) {
  const session = await getSessionWithProfile();
  const email = session.user?.email?.trim().toLowerCase() ?? '';
  if (!session.user?.id || !email || !canAccessCustomerPortal(session.profile?.role)) {
    return NextResponse.json({ error: 'Sign in to upload photos.' }, { status: 401 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Photo uploads are temporarily unavailable.' }, { status: 503 });
  const customer = await resolveAuthenticatedCustomer(admin, {
    authUserId: session.user.id,
    email,
    fullName: session.profile?.full_name,
  });
  if (!customer?.id) return NextResponse.json({ error: 'Your customer profile could not be loaded.' }, { status: 409 });

  const form = await request.formData();
  const appointmentId = str(form.get('appointmentId'));
  const note = str(form.get('note')).slice(0, 500);
  const file = form.get('file');
  if (!appointmentId) return NextResponse.json({ error: 'Choose the appointment for this photo.' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a photo to upload.' }, { status: 400 });
  const extension = ALLOWED_TYPES.get(file.type.toLowerCase());
  if (!extension) return NextResponse.json({ error: 'Use a JPG, PNG, WebP, HEIC, or HEIF photo.' }, { status: 415 });
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Photos must be smaller than 12 MB.' }, { status: 413 });
  }

  const { data: appointment } = await admin
    .from('appointments')
    .select('id, customer_id, guest_email, status')
    .eq('id', appointmentId)
    .maybeSingle();
  const row = appointment as { id?: string; customer_id?: string | null; guest_email?: string | null; status?: string | null } | null;
  const ownsAppointment =
    row?.id &&
    (row.customer_id === customer.id || str(row.guest_email).toLowerCase() === email);
  if (!ownsAppointment) return NextResponse.json({ error: 'This appointment is not connected to your account.' }, { status: 403 });

  const bucket = process.env.JOB_MEDIA_BUCKET?.trim() || 'job-media';
  const listed = await admin.storage.listBuckets();
  if (!listed.data?.some((entry) => entry.name === bucket)) {
    const created = await admin.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: [...ALLOWED_TYPES.keys()],
    });
    if (created.error && !/already exists/i.test(created.error.message)) {
      return NextResponse.json({ error: 'Photo storage is temporarily unavailable.' }, { status: 503 });
    }
  }

  const path = `customer-uploads/${customer.id}/${appointmentId}/${Date.now()}-${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const upload = await admin.storage.from(bucket).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (upload.error) return NextResponse.json({ error: 'The photo could not be uploaded. Please try again.' }, { status: 500 });
  const fileUrl = admin.storage.from(bucket).getPublicUrl(path).data.publicUrl;

  const fullRow = {
    appointment_id: appointmentId,
    customer_id: customer.id,
    uploaded_by: session.user.id,
    category: 'other',
    photo_category: 'customer_upload',
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
    visible_to_customer: true,
    approved_for_customer: true,
    publish_to_gallery: false,
    published_to_gallery: false,
    notes: note || null,
  };
  let inserted = await admin.from('job_media').insert(fullRow).select('id').maybeSingle();
  if (inserted.error && /column|schema cache/i.test(inserted.error.message)) {
    inserted = await admin
      .from('job_media')
      .insert({
        appointment_id: appointmentId,
        customer_id: customer.id,
        uploaded_by: session.user.id,
        category: 'other',
        file_url: fileUrl,
        visible_to_customer: true,
      })
      .select('id')
      .maybeSingle();
  }
  if (inserted.error) {
    await admin.storage.from(bucket).remove([path]);
    return NextResponse.json({ error: 'The photo uploaded but could not be attached to your appointment.' }, { status: 500 });
  }

  await recordJobTimelineEvent(admin, {
    appointmentId,
    eventType: 'customer_photo_uploaded',
    createdBy: session.user.id,
    meta: { mediaId: inserted.data?.id, fileUrl, note: note || undefined },
  });
  return NextResponse.json({ ok: true, id: inserted.data?.id, fileUrl });
}

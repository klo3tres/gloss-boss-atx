'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { isDamageAckComplete } from '@/lib/pre-inspection';
import { recordJobTimelineEvent } from '@/lib/job-timeline-server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

function isSchemaDriftError(msg: string): boolean {
  return /column|schema cache|Could not find|does not exist/i.test(msg);
}

export async function savePreInspectionDamageAckAction(
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const session = await getSessionWithProfile();
  if (!session.user) return { error: 'Sign in required.' };

  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const fallbackBookingId = String(formData.get('fallbackBookingId') ?? '').trim();
  if (!appointmentId && !fallbackBookingId) return { error: 'Missing job reference.' };

  const damageNotes = String(formData.get('damageNotes') ?? '').trim();
  const noVisibleDamage = String(formData.get('noVisibleDamage') ?? '') === 'true';
  const customerAcknowledged = String(formData.get('customerAcknowledged') ?? '') === 'true';
  const customerSignatureName = String(formData.get('customerSignatureName') ?? '').trim();
  const witnessName = String(formData.get('witnessName') ?? '').trim();
  const vehicleIndex = Math.max(0, Number(formData.get('vehicleIndex') ?? '0') || 0);
  const vehicleLabel = String(formData.get('vehicleLabel') ?? '').trim();
  const linkedPhotoIdsRaw = String(formData.get('linkedPhotoIds') ?? '[]');

  if (!customerAcknowledged) return { error: 'Customer must acknowledge pre-existing damage before saving.' };
  if (!customerSignatureName) return { error: 'Customer name / signature is required.' };
  if (!noVisibleDamage && !damageNotes) return { error: 'Add damage notes or mark no visible damage observed.' };

  let linkedPhotoIds: string[] = [];
  try {
    const parsed = JSON.parse(linkedPhotoIdsRaw) as unknown;
    if (Array.isArray(parsed)) linkedPhotoIds = parsed.filter((x) => typeof x === 'string');
  } catch {
    linkedPhotoIds = [];
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return { error: 'Database unavailable.' };

  const technicianName =
    String(session.profile?.full_name ?? '').trim() ||
    String(session.user.email ?? '').trim() ||
    'Technician';
  const now = new Date().toISOString();

  const row = {
    appointment_id: appointmentId || null,
    fallback_booking_id: fallbackBookingId || null,
    vehicle_index: vehicleIndex,
    vehicle_label: vehicleLabel || null,
    damage_notes: damageNotes || null,
    no_visible_damage: noVisibleDamage,
    customer_acknowledged: true,
    customer_signature_name: customerSignatureName,
    technician_id: session.user.id,
    technician_name: technicianName,
    witness_name: witnessName || null,
    acknowledged_at: now,
    linked_photo_ids: linkedPhotoIds,
    updated_at: now,
  };

  const existing = await admin
    .from('pre_inspection_damage_ack')
    .select('id')
    .eq(appointmentId ? 'appointment_id' : 'fallback_booking_id', appointmentId || fallbackBookingId)
    .eq('vehicle_index', vehicleIndex)
    .maybeSingle();

  if (existing.error && !isSchemaDriftError(existing.error.message)) {
    return { error: existing.error.message };
  }

  if (existing.data?.id) {
    const { error } = await admin.from('pre_inspection_damage_ack').update(row).eq('id', existing.data.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await admin.from('pre_inspection_damage_ack').insert({ ...row, created_at: now });
    if (error) {
      if (isSchemaDriftError(error.message)) {
        return { error: 'Pre-inspection tables not migrated yet — run Supabase migration 000054.' };
      }
      return { error: error.message };
    }
  }

  if (damageNotes) {
    await admin.from('tech_job_notes').insert({
      appointment_id: appointmentId || null,
      fallback_booking_id: fallbackBookingId || null,
      damage_notes: damageNotes,
      vehicle_index: vehicleIndex,
      customer_visible: true,
      created_by: session.user.id,
    });
  }

  if (appointmentId) {
    await recordJobTimelineEvent(admin, {
      appointmentId,
      eventType: 'pre_inspection_ack_saved',
      meta: {
        vehicle_index: vehicleIndex,
        no_visible_damage: noVisibleDamage,
        customer: customerSignatureName,
      },
      createdBy: session.user.id,
    });
  }

  const woPath = `/tech/work-orders/${encodeURIComponent(appointmentId || fallbackBookingId)}`;
  revalidatePath(woPath);
  revalidatePath('/tech');
  if (appointmentId) {
    const { data: appt } = await admin.from('appointments').select('customer_id').eq('id', appointmentId).maybeSingle();
    const cid = (appt as { customer_id?: string | null } | null)?.customer_id;
    if (cid) revalidatePath(`/admin/customers/${cid}`);
  }

  if (!isDamageAckComplete({ customer_acknowledged: true, customer_signature_name: customerSignatureName, acknowledged_at: now, damage_notes: damageNotes, no_visible_damage: noVisibleDamage })) {
    return { error: 'Acknowledgement incomplete.' };
  }

  return { ok: true };
}

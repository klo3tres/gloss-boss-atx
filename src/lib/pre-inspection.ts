import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePhotoPhase, resolvePhotoSlot } from '@/lib/photo-phase';

/** Required before work starts (8 slots). */
export const REQUIRED_BEFORE_SLOTS = [
  'front',
  'rear',
  'driver_side',
  'passenger_side',
  'roof',
  'wheels',
  'interior',
  'existing_damage',
] as const;

export type RequiredBeforeSlot = (typeof REQUIRED_BEFORE_SLOTS)[number];

export const BEFORE_SLOT_LABELS: Record<RequiredBeforeSlot, string> = {
  front: 'Front',
  rear: 'Rear',
  driver_side: 'Driver side',
  passenger_side: 'Passenger side',
  roof: 'Roof',
  wheels: 'Wheels',
  interior: 'Interior',
  existing_damage: 'Existing damage',
};

/** Legacy uploads may use `damage` for existing damage slot. */
export function normalizeBeforeSlot(raw: unknown): string {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (s === 'damage') return 'existing_damage';
  return s;
}

export type PhotoRowLike = { category?: unknown; photo_category?: unknown; vehicle_index?: unknown };

export function getRequiredSlotsForService(serviceSlugOrDesc: string | null): RequiredBeforeSlot[] {
  const s = String(serviceSlugOrDesc ?? '').toLowerCase();
  const reqs: RequiredBeforeSlot[] = ['front'];
  if (s.includes('interior')) {
    reqs.push('interior');
  }
  if (s.includes('exterior') || !s.includes('interior')) {
    reqs.push('driver_side', 'passenger_side');
  }
  return reqs;
}

export function assessBeforePhotoSlots(photos: PhotoRowLike[], serviceSlugOrDesc?: string | null): {
  filled: Set<RequiredBeforeSlot>;
  missing: RequiredBeforeSlot[];
  count: number;
  total: number;
} {
  const requiredSlots = serviceSlugOrDesc ? getRequiredSlotsForService(serviceSlugOrDesc) : REQUIRED_BEFORE_SLOTS;
  const filled = new Set<RequiredBeforeSlot>();
  for (const p of photos) {
    if (resolvePhotoPhase(p as Record<string, unknown>) !== 'before') continue;
    const slot = normalizeBeforeSlot(resolvePhotoSlot(p as Record<string, unknown>));
    if ((requiredSlots as readonly string[]).includes(slot)) {
      filled.add(slot as RequiredBeforeSlot);
    }
  }
  const missing = requiredSlots.filter((s) => !filled.has(s));
  return { filled, missing, count: filled.size, total: requiredSlots.length };
}

export type DamageAckRecord = {
  id?: string;
  damage_notes?: string | null;
  no_visible_damage?: boolean | null;
  customer_acknowledged?: boolean | null;
  customer_signature_name?: string | null;
  technician_name?: string | null;
  witness_name?: string | null;
  acknowledged_at?: string | null;
  vehicle_index?: number | null;
  vehicle_label?: string | null;
  linked_photo_ids?: unknown;
};

export function isDamageAckComplete(ack: DamageAckRecord | null | undefined): boolean {
  if (!ack?.customer_acknowledged) return false;
  const name = String(ack.customer_signature_name ?? '').trim();
  if (!name) return false;
  if (!ack.acknowledged_at) return false;
  const notes = String(ack.damage_notes ?? '').trim();
  if (!ack.no_visible_damage && !notes) return false;
  return true;
}

export type PreInspectionGateResult = {
  photosComplete: boolean;
  photoProgress: string;
  missingPhotoLabels: string[];
  damageAckComplete: boolean;
  canStart: boolean;
  missingItems: string[];
};

export function evaluatePreInspectionStartGate(input: {
  photos: PhotoRowLike[];
  damageAck: DamageAckRecord | null;
  agreementSigned: boolean;
  preInspectionOverridden?: boolean;
  serviceSlug?: string | null;
}): PreInspectionGateResult {
  const { missing, count, total } = assessBeforePhotoSlots(input.photos, input.serviceSlug);
  const photoProgress = `${count}/${total}`;
  const missingPhotoLabels = missing.map((s) => BEFORE_SLOT_LABELS[s]);
  const photosComplete = missing.length === 0;
  const damageAckComplete = isDamageAckComplete(input.damageAck);
  const missingItems: string[] = [];
  if (!input.agreementSigned) missingItems.push('Liability agreement not signed');
  if (!photosComplete) missingItems.push(`Before photos (${photoProgress}): ${missingPhotoLabels.join(', ')}`);
  if (!damageAckComplete) missingItems.push('Pre-existing damage acknowledgement');
  const canStart =
    input.preInspectionOverridden ||
    (input.agreementSigned && photosComplete && damageAckComplete);
  return {
    photosComplete,
    photoProgress,
    missingPhotoLabels,
    damageAckComplete,
    canStart,
    missingItems,
  };
}

export type CompletionGateResult = {
  canComplete: boolean;
  missingItems: string[];
};

export function evaluateJobCompletionGate(input: {
  photos: PhotoRowLike[];
  checklistSaved: boolean;
  paymentComplete: boolean;
  agreementSigned: boolean;
  completionOverridden?: boolean;
  adminPaymentOverride?: boolean;
  serviceSlug?: string | null;
}): CompletionGateResult {
  const before = assessBeforePhotoSlots(input.photos, input.serviceSlug);
  const afterCount = input.photos.filter((p) => resolvePhotoPhase(p as Record<string, unknown>) === 'after').length;
  const missingItems: string[] = [];
  if (!input.agreementSigned) missingItems.push('Agreement not signed');
  if (before.missing.length > 0) {
    missingItems.push(`Before photos (${before.count}/${before.total}): ${before.missing.map((s) => BEFORE_SLOT_LABELS[s]).join(', ')}`);
  }
  if (afterCount < 1) missingItems.push('After photos');
  if (!input.checklistSaved) missingItems.push('Service checklist');
  if (!input.paymentComplete && !input.adminPaymentOverride) missingItems.push('Balance due');
  const canComplete = input.completionOverridden || missingItems.length === 0;
  return { canComplete, missingItems };
}

function isSchemaDriftError(msg: string): boolean {
  return /column|schema cache|Could not find|does not exist/i.test(msg);
}

/** Load job_media + job_photos rows for gate checks. */
export async function listJobPhotosForRefs(
  db: SupabaseClient,
  refs: {
    appointmentId?: string;
    fallbackBookingId?: string;
    workflowSessionIds?: string[];
  },
): Promise<PhotoRowLike[]> {
  const rows: PhotoRowLike[] = [];
  const fallbackIds = new Set<string>();
  if (refs.fallbackBookingId) fallbackIds.add(refs.fallbackBookingId);

  if (refs.workflowSessionIds?.length) {
    for (const table of ['job_photos', 'job_media'] as const) {
      const { data } = await db
        .from(table)
        .select('category, photo_category, vehicle_index')
        .in('workflow_session_id', refs.workflowSessionIds)
        .limit(200);
      rows.push(...((data ?? []) as PhotoRowLike[]));
    }
  }

  for (const table of ['job_photos', 'job_media'] as const) {
    if (refs.appointmentId) {
      const { data, error } = await db
        .from(table)
        .select('category, photo_category, vehicle_index')
        .eq('appointment_id', refs.appointmentId)
        .limit(200);
      if (!error) rows.push(...((data ?? []) as PhotoRowLike[]));
      else if (!isSchemaDriftError(error.message)) {
        const lean = await db.from(table).select('category').eq('appointment_id', refs.appointmentId).limit(200);
        if (!lean.error) rows.push(...((lean.data ?? []) as PhotoRowLike[]));
      }
    }
    for (const fbId of fallbackIds) {
      const { data, error } = await db
        .from(table)
        .select('category, photo_category, vehicle_index')
        .eq('fallback_booking_id', fbId)
        .limit(200);
      if (!error) rows.push(...((data ?? []) as PhotoRowLike[]));
      else if (!isSchemaDriftError(error.message)) {
        const lean = await db.from(table).select('category').eq('fallback_booking_id', fbId).limit(200);
        if (!lean.error) rows.push(...((lean.data ?? []) as PhotoRowLike[]));
      }
    }
  }

  return rows;
}

export async function loadPreInspectionDamageAck(
  db: SupabaseClient,
  refs: { appointmentId?: string; fallbackBookingId?: string; vehicleIndex?: number },
): Promise<DamageAckRecord | null> {
  let q = db
    .from('pre_inspection_damage_ack')
    .select(
      'id, damage_notes, no_visible_damage, customer_acknowledged, customer_signature_name, technician_name, witness_name, acknowledged_at, vehicle_index, vehicle_label, linked_photo_ids',
    )
    .order('updated_at', { ascending: false })
    .limit(1);

  if (refs.appointmentId) q = q.eq('appointment_id', refs.appointmentId);
  else if (refs.fallbackBookingId) q = q.eq('fallback_booking_id', refs.fallbackBookingId);
  else return null;

  const vi = refs.vehicleIndex ?? 0;
  q = q.eq('vehicle_index', vi);

  const { data, error } = await q.maybeSingle();
  if (error && isSchemaDriftError(error.message)) return null;
  if (error || !data) return null;
  return data as DamageAckRecord;
}

export function buildPreInspectionRequirements(input: {
  agreementSigned: boolean;
  photoProgress: string;
  photosComplete: boolean;
  damageAckComplete: boolean;
  checklistSaved: boolean;
  afterPhotosOk: boolean;
  paymentComplete: boolean;
  jobStarted: boolean;
  preInspectionOverridden?: boolean;
}): Array<{ label: string; ok: boolean }> {
  const items: Array<{ label: string; ok: boolean }> = [
    { label: 'Agreement signed', ok: input.agreementSigned },
    { label: `Before photos (${input.photoProgress})`, ok: input.photosComplete || Boolean(input.preInspectionOverridden) },
    { label: 'Damage acknowledgement', ok: input.damageAckComplete || Boolean(input.preInspectionOverridden) },
  ];
  if (input.jobStarted) {
    items.push(
      { label: 'After photos', ok: input.afterPhotosOk },
      { label: 'Checklist', ok: input.checklistSaved },
      { label: 'Payment', ok: input.paymentComplete },
    );
  }
  return items;
}

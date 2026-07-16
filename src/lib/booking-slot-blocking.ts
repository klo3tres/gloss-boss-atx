import type { SupabaseClient } from '@supabase/supabase-js';
import { estimatedEndIso, totalBookingDurationMinutes, type VehicleDurationLine } from '@/lib/booking-service-duration';
import type { DurationCatalog } from '@/lib/booking-duration-catalog';

export type BookedBlock = { start: string; end: string; appointmentId?: string };

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function blocksOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

const NON_BLOCKING_STATUSES = new Set(['cancelled', 'canceled', 'deleted', 'voided', 'declined', 'expired', 'draft', 'abandoned']);

function vehicleDurationLines(r: Record<string, unknown>): VehicleDurationLine[] {
  const vehicles = Array.isArray(r.booking_vehicles) ? (r.booking_vehicles as Record<string, unknown>[]) : [];
  if (vehicles.length > 0) {
    return vehicles.map((v) => ({
      serviceSlug: str(v.service_slug) || str(r.service_slug) || 'exterior-wash',
      vehicleClass: str(v.vehicle_class) || str(r.vehicle_class) || 'sedan',
      addOnSlugs: Array.isArray(v.add_on_slugs)
        ? (v.add_on_slugs as string[])
        : Array.isArray(v.addOnSlugs)
          ? (v.addOnSlugs as string[])
          : [],
    }));
  }
  return [{ serviceSlug: str(r.service_slug) || 'exterior-wash', vehicleClass: str(r.vehicle_class) || 'sedan' }];
}

function pushBlockFromRow(
  r: Record<string, unknown>,
  blocks: BookedBlock[],
  rangeStart: number,
  rangeEnd: number,
  seen: Set<string>,
  opts?: { requireConfirmed?: boolean },
) {
  const id = str(r.id);
  if (id && seen.has(id)) return;
  const status = str(r.status).toLowerCase();
  if (NON_BLOCKING_STATUSES.has(status)) return;

  // Unpaid checkout holds only block while fresh (2 hours). Confirmed/paid always block.
  const payStatus = str(r.payment_status).toLowerCase();
  const isHold =
    status === 'awaiting_payment' ||
    status === 'payment_pending' ||
    status === 'checkout_started' ||
    payStatus === 'awaiting_deposit';
  if (isHold) {
    const created = str(r.created_at) || str(r.updated_at) || str(r.scheduled_start);
    const createdMs = created ? new Date(created).getTime() : NaN;
    const HOLD_MS = 2 * 60 * 60 * 1000;
    if (!Number.isNaN(createdMs) && Date.now() - createdMs > HOLD_MS) return;
  }
  if (opts?.requireConfirmed && isHold) return;

  const startIso = str(r.scheduled_start);
  if (!startIso) return;
  const startMs = new Date(startIso).getTime();
  let endMs = r.estimated_end ? new Date(String(r.estimated_end)).getTime() : NaN;
  if (Number.isNaN(endMs)) {
    const lines = vehicleDurationLines(r);
    const mins =
      typeof r.estimated_duration_minutes === 'number' && r.estimated_duration_minutes > 0
        ? r.estimated_duration_minutes
        : totalBookingDurationMinutes(lines);
    endMs = startMs + mins * 60_000;
  }
  // estimated_end / duration already include service buffer — do not double-add here.
  if (endMs <= rangeStart || startMs >= rangeEnd) return;
  if (id) seen.add(id);
  blocks.push({ start: startIso, end: new Date(endMs).toISOString(), appointmentId: id || undefined });
}

export async function fetchBookedBlocks(
  admin: SupabaseClient,
  rangeStartIso: string,
  rangeEndIso: string,
): Promise<BookedBlock[]> {
  const blocks: BookedBlock[] = [];
  const seen = new Set<string>();
  const rangeStart = new Date(rangeStartIso).getTime();
  const rangeEnd = new Date(rangeEndIso).getTime();

  const { data: appts } = await admin
    .from('appointments')
    .select('id, scheduled_start, estimated_end, estimated_duration_minutes, service_slug, vehicle_class, booking_vehicles, status, payment_status, created_at, updated_at, archived_at, deleted_at, schedule_override')
    .gte('scheduled_start', rangeStartIso)
    .lte('scheduled_start', rangeEndIso)
    .is('archived_at', null)
    .is('deleted_at', null);

  const { data: activeAppts } = await admin
    .from('appointments')
    .select('id, scheduled_start, estimated_end, estimated_duration_minutes, service_slug, vehicle_class, booking_vehicles, status, payment_status, created_at, updated_at, archived_at, deleted_at, schedule_override')
    .in('status', ['in_progress', 'assigned', 'confirmed', 'deposit_paid', 'paid_in_full'])
    .is('archived_at', null)
    .is('deleted_at', null)
    .lt('scheduled_start', rangeEndIso);

  for (const row of activeAppts ?? []) {
    const r = row as Record<string, unknown>;
    if (r.schedule_override === true) continue;
    pushBlockFromRow(r, blocks, rangeStart, rangeEnd, seen, { requireConfirmed: true });
  }

  for (const row of appts ?? []) {
    const r = row as Record<string, unknown>;
    if (r.schedule_override === true) continue;
    const status = str(r.status).toLowerCase();
    if (NON_BLOCKING_STATUSES.has(status)) continue;
    const payStatus = str(r.payment_status).toLowerCase();
    if (payStatus === 'refunded' || payStatus === 'voided') continue;
    pushBlockFromRow(r, blocks, rangeStart, rangeEnd, seen);
  }

  const { data: fbs } = await admin
    .from('booking_fallbacks')
    .select('id, scheduled_start, estimated_end, estimated_duration_minutes, service_slug, vehicle_class, booking_vehicles, payload, status, archived_at, deleted_at, schedule_override')
    .gte('scheduled_start', rangeStartIso)
    .lte('scheduled_start', rangeEndIso)
    .is('archived_at', null)
    .is('deleted_at', null);

  for (const row of fbs ?? []) {
    const r = row as Record<string, unknown>;
    if (r.schedule_override === true) continue;
    const st = str(r.status).toLowerCase();
    if (NON_BLOCKING_STATUSES.has(st)) continue;
    pushBlockFromRow(r, blocks, rangeStart, rangeEnd, seen);
  }

  const { data: manualBlocks } = await admin
    .from('booking_availability_blocks')
    .select('id, title, start_at, end_at, blocks_booking')
    .gte('end_at', rangeStartIso)
    .lte('start_at', rangeEndIso)
    .eq('blocks_booking', true);

  for (const row of manualBlocks ?? []) {
    const r = row as Record<string, unknown>;
    const startIso = str(r.start_at);
    const endIso = str(r.end_at);
    if (!startIso || !endIso) continue;
    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    if (endMs <= rangeStart || startMs >= rangeEnd) continue;
    blocks.push({ start: startIso, end: endIso, appointmentId: str(r.id) || undefined });
  }

  return blocks;
}

export function slotConflictsWithBlocks(
  scheduledStartIso: string,
  durationMinutes: number,
  blocks: BookedBlock[],
  excludeAppointmentId?: string,
): boolean {
  const startMs = new Date(scheduledStartIso).getTime();
  // durationMinutes already includes booking buffer from totalBookingDurationMinutes — do not add again.
  const endMs = startMs + durationMinutes * 60_000;
  if (Number.isNaN(startMs)) return true;
  return blocks.some((b) => {
    if (excludeAppointmentId && b.appointmentId === excludeAppointmentId) return false;
    const bStart = new Date(b.start).getTime();
    const bEnd = new Date(b.end).getTime();
    return blocksOverlap(startMs, endMs, bStart, bEnd);
  });
}

export function buildAppointmentScheduleFields(
  scheduledStartIso: string,
  lines: VehicleDurationLine[],
  catalog?: DurationCatalog,
): { estimated_duration_minutes: number; estimated_end: string } {
  const estimated_duration_minutes = totalBookingDurationMinutes(lines, catalog);
  return {
    estimated_duration_minutes,
    estimated_end: estimatedEndIso(scheduledStartIso, estimated_duration_minutes),
  };
}

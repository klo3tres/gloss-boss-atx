import type { SupabaseClient } from '@supabase/supabase-js';
import { estimatedEndIso, totalBookingDurationMinutes, type VehicleDurationLine } from '@/lib/booking-service-duration';

export type BookedBlock = { start: string; end: string; appointmentId?: string };

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function blocksOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export async function fetchBookedBlocks(
  admin: SupabaseClient,
  rangeStartIso: string,
  rangeEndIso: string,
): Promise<BookedBlock[]> {
  const blocks: BookedBlock[] = [];
  const rangeStart = new Date(rangeStartIso).getTime();
  const rangeEnd = new Date(rangeEndIso).getTime();

  const { data: appts } = await admin
    .from('appointments')
    .select('id, scheduled_start, estimated_end, estimated_duration_minutes, service_slug, vehicle_class, booking_vehicles, status, archived_at, deleted_at, schedule_override')
    .gte('scheduled_start', rangeStartIso)
    .lte('scheduled_start', rangeEndIso)
    .is('archived_at', null)
    .is('deleted_at', null);

  for (const row of appts ?? []) {
    const r = row as Record<string, unknown>;
    if (r.schedule_override === true) continue;
    const status = str(r.status).toLowerCase();
    if (status === 'cancelled' || status === 'deleted' || status === 'test_comped') continue;

    const startIso = str(r.scheduled_start);
    if (!startIso) continue;
    const startMs = new Date(startIso).getTime();
    let endMs = r.estimated_end ? new Date(String(r.estimated_end)).getTime() : NaN;
    if (Number.isNaN(endMs)) {
      const vehicles = Array.isArray(r.booking_vehicles) ? (r.booking_vehicles as VehicleDurationLine[]) : [];
      const lines: VehicleDurationLine[] =
        vehicles.length > 0
          ? vehicles.map((v) => ({
              serviceSlug: str((v as Record<string, unknown>).service_slug) || str(r.service_slug),
              vehicleClass: str((v as Record<string, unknown>).vehicle_class) || str(r.vehicle_class) || 'sedan',
            }))
          : [{ serviceSlug: str(r.service_slug) || 'exterior-wash', vehicleClass: str(r.vehicle_class) || 'sedan' }];
      const mins =
        typeof r.estimated_duration_minutes === 'number' && r.estimated_duration_minutes > 0
          ? r.estimated_duration_minutes
          : totalBookingDurationMinutes(lines);
      endMs = startMs + mins * 60_000;
    }
    if (endMs <= rangeStart || startMs >= rangeEnd) continue;
    blocks.push({ start: startIso, end: new Date(endMs).toISOString(), appointmentId: str(r.id) });
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
    const startIso = str(r.scheduled_start);
    if (!startIso) continue;
    const startMs = new Date(startIso).getTime();
    let endMs = r.estimated_end ? new Date(String(r.estimated_end)).getTime() : NaN;
    if (Number.isNaN(endMs)) {
      const payload = r.payload && typeof r.payload === 'object' ? (r.payload as Record<string, unknown>) : {};
      const vehicles = Array.isArray(r.booking_vehicles)
        ? (r.booking_vehicles as VehicleDurationLine[])
        : Array.isArray(payload.booking_vehicles)
          ? (payload.booking_vehicles as VehicleDurationLine[])
          : [];
      const lines: VehicleDurationLine[] =
        vehicles.length > 0
          ? vehicles.map((v) => ({
              serviceSlug: str((v as Record<string, unknown>).service_slug) || str(r.service_slug),
              vehicleClass: str((v as Record<string, unknown>).vehicle_class) || str(r.vehicle_class) || 'sedan',
            }))
          : [{ serviceSlug: str(r.service_slug) || 'exterior-wash', vehicleClass: str(r.vehicle_class) || 'sedan' }];
      const mins =
        typeof r.estimated_duration_minutes === 'number' && r.estimated_duration_minutes > 0
          ? r.estimated_duration_minutes
          : totalBookingDurationMinutes(lines);
      endMs = startMs + mins * 60_000;
    }
    if (endMs <= rangeStart || startMs >= rangeEnd) continue;
    blocks.push({ start: startIso, end: new Date(endMs).toISOString() });
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
): { estimated_duration_minutes: number; estimated_end: string } {
  const estimated_duration_minutes = totalBookingDurationMinutes(lines);
  return {
    estimated_duration_minutes,
    estimated_end: estimatedEndIso(scheduledStartIso, estimated_duration_minutes),
  };
}

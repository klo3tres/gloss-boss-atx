import type { SupabaseClient } from '@supabase/supabase-js';
import { totalBookingDurationMinutes, type VehicleDurationLine } from '@/lib/booking-service-duration';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function vehicleLinesFromRow(row: Record<string, unknown>): VehicleDurationLine[] {
  const vehicles = Array.isArray(row.booking_vehicles) ? (row.booking_vehicles as Record<string, unknown>[]) : [];
  if (vehicles.length > 0) {
    return vehicles.map((v) => ({
      serviceSlug: str(v.service_slug) || str(row.service_slug) || 'exterior-wash',
      vehicleClass: str(v.vehicle_class) || str(row.vehicle_class) || 'sedan',
      addOnSlugs: Array.isArray(v.add_on_slugs)
        ? (v.add_on_slugs as string[])
        : Array.isArray(v.addOnSlugs)
          ? (v.addOnSlugs as string[])
          : [],
    }));
  }
  return [{ serviceSlug: str(row.service_slug) || 'exterior-wash', vehicleClass: str(row.vehicle_class) || 'sedan' }];
}

/** Keep booking_availability_blocks in sync with Titan appointments (blocks public slots). */
export async function upsertAppointmentAvailabilityBlock(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<void> {
  const { data: appt } = await admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
  if (!appt) return;

  const row = appt as Record<string, unknown>;
  const status = str(row.status).toLowerCase();
  if (status === 'cancelled' || row.archived_at || row.deleted_at) {
    await admin.from('booking_availability_blocks').delete().eq('appointment_id', appointmentId);
    return;
  }

  const startIso = str(row.scheduled_start);
  if (!startIso) return;

  const startMs = new Date(startIso).getTime();
  let endIso = str(row.estimated_end);
  if (!endIso) {
    const mins =
      typeof row.estimated_duration_minutes === 'number' && row.estimated_duration_minutes > 0
        ? row.estimated_duration_minutes
        : totalBookingDurationMinutes(vehicleLinesFromRow(row));
    endIso = new Date(startMs + mins * 60_000).toISOString();
  }

  const guest = str(row.guest_name) || 'Booking';
  const payload = {
    title: `${guest} — Titan booking`,
    start_at: startIso,
    end_at: endIso,
    blocks_booking: row.schedule_override !== true,
    source: 'titan_appointment',
    appointment_id: appointmentId,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await admin
    .from('booking_availability_blocks')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle();

  if (existing?.id) {
    await admin.from('booking_availability_blocks').update(payload).eq('id', existing.id);
  } else {
    await admin.from('booking_availability_blocks').insert(payload);
  }
}

export async function removeAppointmentAvailabilityBlock(admin: SupabaseClient, appointmentId: string): Promise<void> {
  await admin.from('booking_availability_blocks').delete().eq('appointment_id', appointmentId);
}

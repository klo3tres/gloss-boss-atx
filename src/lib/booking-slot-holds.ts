import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchBookedBlocks, slotConflictsWithBlocks } from '@/lib/booking-slot-blocking';

export const BOOKING_HOLD_MINUTES = 15;

export type BookingHoldState =
  | 'available'
  | 'held_by_this_session'
  | 'held_by_another_session'
  | 'booked'
  | 'expired'
  | 'released'
  | 'cancelled'
  | 'converting_to_checkout'
  | 'invalid';

export function validBookingSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{20,120}$/.test(value.trim());
}

export async function reserveBookingSlot(
  admin: SupabaseClient,
  input: {
    bookingSessionId: string;
    scheduledStartIso: string;
    durationMinutes: number;
    excludeAppointmentId?: string | null;
    isTest?: boolean;
  },
): Promise<{
  ok: boolean;
  state: BookingHoldState;
  holdId?: string;
  expiresAt?: string;
  error?: string;
}> {
  if (!validBookingSessionId(input.bookingSessionId)) {
    return { ok: false, state: 'invalid', error: 'Booking session is missing or invalid.' };
  }
  const start = new Date(input.scheduledStartIso);
  const durationMinutes = Math.max(15, Math.min(24 * 60, Math.round(input.durationMinutes)));
  if (Number.isNaN(start.getTime())) {
    return { ok: false, state: 'invalid', error: 'Appointment time is invalid.' };
  }
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const rangeStart = new Date(start.getTime() - 24 * 60 * 60_000).toISOString();
  const rangeEnd = new Date(end.getTime() + 24 * 60 * 60_000).toISOString();
  const blocks = await fetchBookedBlocks(admin, rangeStart, rangeEnd);
  if (
    slotConflictsWithBlocks(
      start.toISOString(),
      durationMinutes,
      blocks,
      input.excludeAppointmentId ?? undefined,
      input.bookingSessionId,
    )
  ) {
    return {
      ok: false,
      state: 'booked',
      error: 'That time overlaps an existing confirmed appointment.',
    };
  }

  const result = await admin.rpc('reserve_booking_slot', {
    p_booking_session_id: input.bookingSessionId,
    p_scheduled_start: start.toISOString(),
    p_scheduled_end: end.toISOString(),
    p_is_test: input.isTest === true,
  });
  if (result.error) {
    return { ok: false, state: 'invalid', error: result.error.message };
  }
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  const state = String(row?.hold_state ?? 'invalid') as BookingHoldState;
  return {
    ok: state === 'held_by_this_session',
    state,
    holdId: row?.hold_id ? String(row.hold_id) : undefined,
    expiresAt: row?.hold_expires_at ? String(row.hold_expires_at) : undefined,
    error:
      state === 'held_by_another_session'
        ? 'Another customer is currently completing this time. Choose another slot or try again when the hold expires.'
        : state === 'held_by_this_session'
          ? undefined
          : 'This time could not be held.',
  };
}

export async function releaseBookingSlot(
  admin: SupabaseClient,
  bookingSessionId: string,
  reason: 'released' | 'cancelled' = 'released',
) {
  if (!validBookingSessionId(bookingSessionId)) return;
  await admin
    .from('booking_slot_holds')
    .update({ status: reason, updated_at: new Date().toISOString() })
    .eq('booking_session_id', bookingSessionId)
    .in('status', ['held', 'converting_to_checkout']);
}

export async function convertBookingSlotHold(
  admin: SupabaseClient,
  input: { bookingSessionId: string; holdId?: string | null; appointmentId: string },
) {
  if (!validBookingSessionId(input.bookingSessionId)) return;
  let query = admin
    .from('booking_slot_holds')
    .update({
      status: 'booked',
      appointment_id: input.appointmentId,
      updated_at: new Date().toISOString(),
    })
    .eq('booking_session_id', input.bookingSessionId);
  if (input.holdId) query = query.eq('id', input.holdId);
  await query;
}

import { NextResponse } from 'next/server';
import { isBookingSlotAllowed } from '@/lib/booking-availability';
import { loadDurationCatalog } from '@/lib/booking-duration-catalog';
import { totalBookingDurationMinutes } from '@/lib/booking-service-duration';
import { reserveBookingSlot, releaseBookingSlot, validBookingSessionId } from '@/lib/booking-slot-holds';
import { loadBookingAvailabilityRules } from '@/lib/booking-server-shared';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

type HoldBody = {
  action?: 'hold' | 'refresh' | 'release' | 'cancel';
  bookingSessionId?: string;
  scheduledStart?: string;
  vehicles?: Array<{
    serviceSlug?: string;
    vehicleClass?: string;
    addOnSlugs?: string[];
  }>;
  isTest?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as HoldBody | null;
  const bookingSessionId = String(body?.bookingSessionId ?? '').trim();
  if (!validBookingSessionId(bookingSessionId)) {
    return NextResponse.json({ error: 'Invalid booking session.', code: 'INVALID_BOOKING_SESSION' }, { status: 400 });
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Booking service unavailable.' }, { status: 503 });

  if (body?.action === 'release' || body?.action === 'cancel') {
    await releaseBookingSlot(admin, bookingSessionId, body.action === 'cancel' ? 'cancelled' : 'released');
    return NextResponse.json({ ok: true, state: body.action === 'cancel' ? 'cancelled' : 'released' });
  }

  const scheduled = new Date(String(body?.scheduledStart ?? ''));
  if (Number.isNaN(scheduled.getTime())) {
    return NextResponse.json({ error: 'Choose an appointment time first.', code: 'INVALID_SLOT' }, { status: 400 });
  }
  const rules = await loadBookingAvailabilityRules(admin);
  if (!isBookingSlotAllowed(scheduled, rules)) {
    return NextResponse.json(
      { error: 'That time is outside online booking hours.', code: 'OUTSIDE_BOOKING_HOURS' },
      { status: 409 },
    );
  }
  const vehicles = Array.isArray(body?.vehicles) ? body!.vehicles!.slice(0, 3) : [];
  if (!vehicles.length || vehicles.some((line) => !line.serviceSlug || !line.vehicleClass)) {
    return NextResponse.json(
      { error: 'Choose the service and vehicle before holding a time.', code: 'MISSING_SERVICE' },
      { status: 400 },
    );
  }
  const catalog = await loadDurationCatalog(admin);
  const durationMinutes = totalBookingDurationMinutes(
    vehicles.map((line) => ({
      serviceSlug: String(line.serviceSlug),
      vehicleClass: String(line.vehicleClass),
      addOnSlugs: Array.isArray(line.addOnSlugs) ? line.addOnSlugs.map(String) : [],
    })),
    catalog,
  );
  const hold = await reserveBookingSlot(admin, {
    bookingSessionId,
    scheduledStartIso: scheduled.toISOString(),
    durationMinutes,
    isTest: body?.isTest === true,
  });
  return NextResponse.json(
    {
      ok: hold.ok,
      state: hold.state,
      holdId: hold.holdId,
      expiresAt: hold.expiresAt,
      durationMinutes,
      error: hold.error,
      code: hold.ok ? undefined : hold.state === 'held_by_another_session' ? 'SLOT_HELD_BY_ANOTHER' : 'SLOT_CONFLICT',
    },
    { status: hold.ok ? 200 : 409 },
  );
}

import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { DEFAULT_BOOKING_AVAILABILITY, parseBookingAvailabilityRules } from '@/lib/booking-availability';
import type { BookingAvailabilityConfig } from '@/lib/booking-availability-config';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

function parseWindowBody(raw: unknown) {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  return {
    startHour: Number(o.startHour),
    startMinute: Number(o.startMinute),
    endHour: Number(o.endHour),
    endMinute: Number(o.endMinute),
  };
}

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const allowSaturday = body.allowSaturday === true;
  const allowSunday = body.allowSunday === true;
  const allowAllOtherDays = body.allowAllOtherDays === true;
  const fridayHour = Number(body.allowFridayAfterHour ?? DEFAULT_BOOKING_AVAILABILITY.allowFridayAfterHour);
  const slotIntervalMinutes = Number(body.slotIntervalMinutes ?? DEFAULT_BOOKING_AVAILABILITY.slotIntervalMinutes);
  const blackoutRaw = String(body.blackoutDates ?? '');
  const blackoutDates = blackoutRaw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));

  const payload: BookingAvailabilityConfig = parseBookingAvailabilityRules({
    allowFridayAfterHour: Number.isFinite(fridayHour) ? Math.min(23, Math.max(0, fridayHour)) : 17,
    allowFridayAfterMinute: 0,
    allowSaturday,
    allowSunday,
    allowAllOtherDays,
    slotIntervalMinutes: Number.isFinite(slotIntervalMinutes) ? Math.min(120, Math.max(5, Math.round(slotIntervalMinutes))) : 15,
    blackoutDates,
    fridayWindow: parseWindowBody(body.fridayWindow) ?? DEFAULT_BOOKING_AVAILABILITY.fridayWindow,
    saturdayWindow: parseWindowBody(body.saturdayWindow) ?? DEFAULT_BOOKING_AVAILABILITY.saturdayWindow,
    sundayWindow: parseWindowBody(body.sundayWindow) ?? DEFAULT_BOOKING_AVAILABILITY.sundayWindow,
  }) as BookingAvailabilityConfig;

  const fullPayload: BookingAvailabilityConfig = { ...payload, blackoutDates };

  const { error } = await admin.from('site_settings').upsert(
    { key: 'booking_availability', value: JSON.stringify(fullPayload), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  revalidatePath('/admin/cms');
  revalidatePath('/book');
  return NextResponse.json({ ok: true });
}

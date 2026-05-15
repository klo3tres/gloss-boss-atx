import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { DEFAULT_BOOKING_AVAILABILITY } from '@/lib/booking-availability';
import type { BookingAvailabilityConfig } from '@/lib/booking-availability-config';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

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
  const blackoutRaw = String(body.blackoutDates ?? '');
  const blackoutDates = blackoutRaw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));

  const payload: BookingAvailabilityConfig = {
    allowFridayAfterHour: Number.isFinite(fridayHour) ? Math.min(23, Math.max(0, fridayHour)) : 17,
    allowFridayAfterMinute: 0,
    allowSaturday,
    allowSunday,
    allowAllOtherDays,
    blackoutDates,
    fridayWindow: DEFAULT_BOOKING_AVAILABILITY.fridayWindow,
    saturdayWindow: DEFAULT_BOOKING_AVAILABILITY.saturdayWindow,
    sundayWindow: DEFAULT_BOOKING_AVAILABILITY.sundayWindow,
  };

  const { error } = await admin.from('site_settings').upsert(
    { key: 'booking_availability', value: JSON.stringify(payload), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  revalidatePath('/admin/cms');
  revalidatePath('/book');
  return NextResponse.json({ ok: true });
}

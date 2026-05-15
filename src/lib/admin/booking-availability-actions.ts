'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSessionWithProfile } from '@/lib/auth/session';
import { DEFAULT_BOOKING_AVAILABILITY } from '@/lib/booking-availability';
import type { BookingAvailabilityConfig } from '@/lib/booking-availability-config';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function saveBookingAvailabilityAction(formData: FormData) {
  const session = await getSessionWithProfile();
  if (!session.user || !['admin', 'super_admin'].includes(session.profile?.role ?? '')) {
    redirect('/admin/cms?availErr=' + encodeURIComponent('Admin access required'));
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    redirect('/admin/cms?availErr=' + encodeURIComponent('Service role unavailable'));
  }

  const allowSaturday = formData.get('allowSaturday') === 'on';
  const allowSunday = formData.get('allowSunday') === 'on';
  const allowAllOtherDays = formData.get('allowAllOtherDays') === 'on';
  const fridayHour = Number(formData.get('allowFridayAfterHour') ?? DEFAULT_BOOKING_AVAILABILITY.allowFridayAfterHour);
  const blackoutRaw = String(formData.get('blackoutDates') ?? '');
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
  };

  try {
    const { error } = await admin.from('site_settings').upsert(
      { key: 'booking_availability', value: JSON.stringify(payload), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
    if (error) {
      redirect('/admin/cms?availErr=' + encodeURIComponent(error.message));
    }
  } catch (e) {
    redirect('/admin/cms?availErr=' + encodeURIComponent(e instanceof Error ? e.message : 'Save failed'));
  }

  revalidatePath('/admin/cms');
  revalidatePath('/book');
  redirect('/admin/cms?availOk=1');
}

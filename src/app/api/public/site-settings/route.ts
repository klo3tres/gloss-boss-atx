import { NextResponse } from 'next/server';
import { DEFAULT_BOOKING_AVAILABILITY } from '@/lib/booking-availability';
import { parseBookingAvailabilityConfig, type BookingAvailabilityConfig } from '@/lib/booking-availability-config';
import { tryCreateAdminSupabase, tryCreateRoutePublicSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

/** Public read for marketing keys (navbar logo, booking availability). */
export async function GET() {
  try {
    const client = tryCreateRoutePublicSupabase() ?? tryCreateAdminSupabase();
    if (!client) {
      return NextResponse.json({
        navbarLogo: null as string | null,
        bookingAvailability: { ...DEFAULT_BOOKING_AVAILABILITY, blackoutDates: [] },
      });
    }
    const { data: rows, error } = await client.from('site_settings').select('key, value, allow_free_test_promo').in('key', ['navbar_logo', 'booking_availability', 'allow_free_test_promo']);
    if (error) {
      console.warn('[site_settings]', error.message);
      return NextResponse.json({
        navbarLogo: null as string | null,
        bookingAvailability: { ...DEFAULT_BOOKING_AVAILABILITY, blackoutDates: [] },
      });
    }
    let navbarLogo: string | null = null;
    let bookingAvailability: BookingAvailabilityConfig = { ...DEFAULT_BOOKING_AVAILABILITY, blackoutDates: [] };
    let allowFreeTestPromo = false;
    for (const row of rows ?? []) {
      const key = typeof row?.key === 'string' ? row.key : '';
      const val = typeof row?.value === 'string' ? row.value.trim() : '';
      if (key === 'navbar_logo' && val) navbarLogo = val;
      if (row?.allow_free_test_promo === true || (key === 'allow_free_test_promo' && val.toLowerCase() === 'true')) allowFreeTestPromo = true;
      if (key === 'booking_availability' && val) {
        try {
          bookingAvailability = parseBookingAvailabilityConfig(JSON.parse(val));
        } catch {
          bookingAvailability = { ...DEFAULT_BOOKING_AVAILABILITY, blackoutDates: [] };
        }
      }
    }
    return NextResponse.json(
      { navbarLogo, bookingAvailability, allowFreeTestPromo },
      { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } },
    );
  } catch (e) {
    console.warn('[site_settings]', e);
    return NextResponse.json({
      navbarLogo: null as string | null,
      bookingAvailability: { ...DEFAULT_BOOKING_AVAILABILITY, blackoutDates: [] },
    });
  }
}

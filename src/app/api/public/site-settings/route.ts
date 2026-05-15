import { NextResponse } from 'next/server';
import { DEFAULT_BOOKING_AVAILABILITY, parseBookingAvailabilityRules } from '@/lib/booking-availability';
import { tryCreateAdminSupabase, tryCreateRoutePublicSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

/** Public read for marketing keys (navbar logo, booking availability). */
export async function GET() {
  try {
    const client = tryCreateRoutePublicSupabase() ?? tryCreateAdminSupabase();
    if (!client) {
      return NextResponse.json({
        navbarLogo: null as string | null,
        bookingAvailability: DEFAULT_BOOKING_AVAILABILITY,
      });
    }
    const { data: rows, error } = await client.from('site_settings').select('key, value').in('key', ['navbar_logo', 'booking_availability']);
    if (error) {
      console.warn('[site_settings]', error.message);
      return NextResponse.json({
        navbarLogo: null as string | null,
        bookingAvailability: DEFAULT_BOOKING_AVAILABILITY,
      });
    }
    let navbarLogo: string | null = null;
    let bookingAvailability = DEFAULT_BOOKING_AVAILABILITY;
    for (const row of rows ?? []) {
      const key = typeof row?.key === 'string' ? row.key : '';
      const val = typeof row?.value === 'string' ? row.value.trim() : '';
      if (key === 'navbar_logo' && val) navbarLogo = val;
      if (key === 'booking_availability' && val) {
        try {
          bookingAvailability = parseBookingAvailabilityRules(JSON.parse(val));
        } catch {
          bookingAvailability = DEFAULT_BOOKING_AVAILABILITY;
        }
      }
    }
    return NextResponse.json(
      { navbarLogo, bookingAvailability },
      { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } },
    );
  } catch (e) {
    console.warn('[site_settings]', e);
    return NextResponse.json({
      navbarLogo: null as string | null,
      bookingAvailability: DEFAULT_BOOKING_AVAILABILITY,
    });
  }
}

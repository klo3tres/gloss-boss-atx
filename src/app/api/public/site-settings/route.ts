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
    let settings: { data: unknown[] | null; error: { message: string } | null };
    settings = await client.from('site_settings').select('key, value, allow_free_test_promo').in('key', ['navbar_logo', 'booking_availability', 'allow_free_test_promo']);
    if (settings.error && /allow_free_test_promo|column|schema cache|Could not find|does not exist/i.test(settings.error.message)) {
      settings = await client.from('site_settings').select('key, value').in('key', ['navbar_logo', 'booking_availability', 'allow_free_test_promo']);
    }
    const { data: rows, error } = settings;
    if (error) {
      console.warn('[site_settings]', error.message);
      return NextResponse.json({
        navbarLogo: null as string | null,
        bookingAvailability: { ...DEFAULT_BOOKING_AVAILABILITY, blackoutDates: [] },
      });
    }
    let navbarLogo: string | null = null;
    let bookingAvailability: BookingAvailabilityConfig = { ...DEFAULT_BOOKING_AVAILABILITY, blackoutDates: [] };
    const { isFreePromoEnabled } = await import('@/lib/free-promo');
    let allowFreeTestPromo = await isFreePromoEnabled(client);
    for (const raw of rows ?? []) {
      const row = (raw ?? {}) as Record<string, unknown>;
      const key = typeof row.key === 'string' ? row.key : '';
      const val = typeof row.value === 'string' ? row.value.trim() : '';
      if (key === 'navbar_logo' && val) navbarLogo = val;
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

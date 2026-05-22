import { NextResponse } from 'next/server';
import { fetchBookedBlocks } from '@/lib/booking-slot-blocking';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

/** Public read of occupied booking windows (for slot picker). */
export async function GET(request: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ blocks: [] });

  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? new Date().toISOString();
  const to =
    url.searchParams.get('to') ??
    new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const blocks = await fetchBookedBlocks(admin, from, to);
    return NextResponse.json({ blocks });
  } catch (e) {
    console.warn('[booked-slots]', e);
    return NextResponse.json({ blocks: [] });
  }
}

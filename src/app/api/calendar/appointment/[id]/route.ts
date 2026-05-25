import { NextResponse } from 'next/server';
import { buildBookingIcsEvent } from '@/lib/ics-calendar';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const { data: appt } = await admin.from('appointments').select('*').eq('id', id).maybeSingle();
  const row = (appt ?? null) as Record<string, unknown> | null;
  if (!row?.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const guest = String(row.guest_name ?? 'Customer');
  const when = String(row.scheduled_start ?? new Date().toISOString());
  const addr = [row.service_address, row.service_city, row.service_state, row.service_zip].filter(Boolean).join(', ');
  const vehicles = String(row.vehicle_description ?? '');
  const total = typeof row.base_price_cents === 'number' ? `$${(row.base_price_cents / 100).toFixed(2)}` : '';
  const ics = buildBookingIcsEvent({
    uid: String(row.id),
    title: `Gloss Boss — ${guest}`,
    description: [`Customer: ${guest}`, row.guest_phone ? `Phone: ${row.guest_phone}` : '', vehicles, total ? `Revenue est: ${total}` : ''].filter(Boolean).join('\n'),
    location: addr || 'Mobile — see work order',
    startIso: when,
    durationMinutes: typeof row.estimated_duration_minutes === 'number' ? row.estimated_duration_minutes : 120,
  });

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="gloss-boss-booking-${id.slice(0, 8)}.ics"`,
    },
  });
}

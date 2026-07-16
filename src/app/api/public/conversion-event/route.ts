import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

const ALLOWED = new Set(['homepage_hero_cta','services_viewed','booking_started','vehicle_entered','service_selected','date_selected','contact_entered','promo_entered','deposit_started','deposit_completed','booking_completed']);

export async function POST(request: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const eventType = String(body.eventType ?? '').trim();
  if (!ALLOWED.has(eventType)) return NextResponse.json({ ok: false, error: 'Unsupported event' }, { status: 400 });
  const sessionId = String(body.sessionId ?? '').trim().slice(0, 80);
  const sourcePath = String(body.sourcePath ?? '').trim().slice(0, 180);
  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {};
  const { error } = await admin.from('conversion_events').insert({ event_type: eventType, session_id: sessionId || null, source_path: sourcePath || null, metadata, is_test: body.isTest === true });
  return NextResponse.json({ ok: !error }, { status: error ? 400 : 200 });
}

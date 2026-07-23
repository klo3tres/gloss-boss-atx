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
  const campaignId = String((metadata as Record<string, unknown>).campaignId ?? '').trim();
  const campaignRecipientToken = String((metadata as Record<string, unknown>).campaignRecipientToken ?? '').trim();
  if (campaignId && eventType === 'booking_started') {
    const { data: campaign } = await admin.from('customer_campaigns').select('booking_start_count, meta').eq('id', campaignId).maybeSingle();
    if (campaign) {
      const meta = campaign.meta && typeof campaign.meta === 'object' ? campaign.meta as Record<string, unknown> : {};
      const tracking = meta.tracking && typeof meta.tracking === 'object' ? meta.tracking as Record<string, unknown> : {};
      await admin.from('customer_campaigns').update({
        booking_start_count: Number((campaign as Record<string, unknown>).booking_start_count ?? 0) + 1,
        meta: { ...meta, tracking: { ...tracking, bookingStarts: Number(tracking.bookingStarts ?? 0) + 1 } },
        updated_at: new Date().toISOString(),
      }).eq('id', campaignId);
    }
    if (campaignRecipientToken) {
      const now = new Date().toISOString();
      const { data: recipient } = await admin.from('customer_campaign_recipients').select('id,customer_id,booking_started_at').eq('tracking_token', campaignRecipientToken).eq('campaign_id', campaignId).maybeSingle();
      if (recipient && !recipient.booking_started_at) {
        await Promise.all([
          admin.from('customer_campaign_recipients').update({ booking_started_at: now, updated_at: now }).eq('id', recipient.id).is('booking_started_at', null),
          admin.from('customer_campaign_events').insert({ campaign_id: campaignId, recipient_id: recipient.id, customer_id: recipient.customer_id, event_type: 'booking_started', meta: { session_id: sessionId } }),
        ]);
      }
    }
  }
  return NextResponse.json({ ok: !error }, { status: error ? 400 : 200 });
}

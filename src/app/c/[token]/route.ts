import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const admin = tryCreateAdminSupabase();
  const origin = new URL(request.url).origin;
  const safeFallback = new URL('/book', origin);
  if (!admin || !/^[a-f0-9]{24,80}$/i.test(token)) return NextResponse.redirect(safeFallback, 302);
  const { data: recipient } = await admin.from('customer_campaign_recipients').select('id,campaign_id,customer_id,clicked_at,status').eq('tracking_token', token).maybeSingle();
  if (!recipient || ['excluded','opted_out','canceled','permanent_failure'].includes(String(recipient.status))) return NextResponse.redirect(safeFallback, 302);
  const { data: campaign } = await admin.from('customer_campaigns').select('status,destination_path,expires_at,offer_id,offer_code,recommended_service_slug,click_count').eq('id', recipient.campaign_id).maybeSingle();
  if (!campaign || ['canceled','failed'].includes(String(campaign.status)) || (campaign.expires_at && Date.parse(campaign.expires_at) <= Date.now())) return NextResponse.redirect(safeFallback, 302);
  const firstClick = !recipient.clicked_at;
  if (firstClick) {
    const now = new Date().toISOString();
    await Promise.all([
      admin.from('customer_campaign_recipients').update({ clicked_at: now, updated_at: now }).eq('id', recipient.id).is('clicked_at', null),
      admin.from('customer_campaign_events').insert({ campaign_id: recipient.campaign_id, recipient_id: recipient.id, customer_id: recipient.customer_id, event_type: 'clicked', meta: { token } }),
      admin.from('customer_campaigns').update({ click_count: Number(campaign.click_count ?? 0) + 1, updated_at: now }).eq('id', recipient.campaign_id),
    ]);
  }
  const destination = String(campaign.destination_path ?? '/book');
  const target = new URL(destination.startsWith('/') ? destination : '/book', origin);
  target.searchParams.set('campaign', recipient.campaign_id);
  target.searchParams.set('cr', token);
  if (campaign.recommended_service_slug && !target.searchParams.has('service')) target.searchParams.set('service', campaign.recommended_service_slug);
  if (campaign.offer_id && !target.searchParams.has('offer')) target.searchParams.set('offer', campaign.offer_id);
  return NextResponse.redirect(target, 302);
}

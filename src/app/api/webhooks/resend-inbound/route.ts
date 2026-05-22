import { NextResponse } from 'next/server';
import {
  inboundForwardTo,
  inboundMailboxAddress,
  processInboundEmailEvent,
  verifyResendWebhookSignature,
  type ResendInboundWebhookEvent,
} from '@/lib/email/inbound-email';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Resend inbound webhook (`email.received`).
 * Configure in Resend → Webhooks → URL: {NEXT_PUBLIC_APP_URL}/api/webhooks/resend-inbound
 * MX for glossbossatx.com must point to Resend inbound (see docs/INBOUND_EMAIL.md).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: ResendInboundWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ResendInboundWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const verified = verifyResendWebhookSignature(rawBody, {
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
  }, secret);

  if (!verified) {
    console.warn('[resend-inbound] webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    console.error('[resend-inbound] SUPABASE_SERVICE_ROLE_KEY missing');
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  try {
    const result = await processInboundEmailEvent(admin, event);
    console.info('[resend-inbound]', {
      type: event.type,
      email_id: event.data?.email_id,
      to: event.data?.to,
      mailbox: inboundMailboxAddress(),
      forwardTo: inboundForwardTo(),
      ...result,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[resend-inbound] process failed', e);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    mailbox: inboundMailboxAddress(),
    forwardTo: inboundForwardTo(),
    hint: 'POST Resend email.received webhooks to this URL.',
  });
}

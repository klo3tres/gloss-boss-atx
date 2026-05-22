import { NextResponse } from 'next/server';
import {
  RESEND_WEBHOOK_EVENTS,
  RESEND_WEBHOOK_PATH,
  inboundForwardTo,
  inboundMailboxAddress,
  processResendWebhookRequest,
} from '@/lib/resend-webhook';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Canonical Resend webhook — configure ONE endpoint in Resend dashboard.
 * Handles inbound (email.received) and outbound lifecycle events.
 */
export async function POST(request: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  const { status, body } = await processResendWebhookRequest(request, admin);
  return NextResponse.json(body, { status });
}

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, '') ?? '';
  const webhookUrl = appUrl ? `${appUrl}${RESEND_WEBHOOK_PATH}` : RESEND_WEBHOOK_PATH;

  return NextResponse.json({
    ok: true,
    canonical: RESEND_WEBHOOK_PATH,
    webhook_url: webhookUrl,
    mailbox: inboundMailboxAddress(),
    forward_to: inboundForwardTo(),
    required_events: RESEND_WEBHOOK_EVENTS,
    resend_webhook_secret_configured: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
  });
}

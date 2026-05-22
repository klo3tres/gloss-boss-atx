import { NextResponse } from 'next/server';
import { RESEND_WEBHOOK_PATH, processResendWebhookRequest } from '@/lib/resend-webhook';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEPRECATED = '/api/webhooks/resend-inbound';

/**
 * @deprecated Use POST /api/resend/webhook only. This route still processes events
 * for backward compatibility but must not be configured as a second Resend webhook.
 */
export async function POST(request: Request) {
  console.warn(`[resend] ${DEPRECATED} is deprecated — configure ${RESEND_WEBHOOK_PATH} in Resend instead`);

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  const { status, body } = await processResendWebhookRequest(request, admin);
  return NextResponse.json(
    { ...body, deprecated: true, canonical: RESEND_WEBHOOK_PATH },
    { status, headers: { 'X-Deprecated-Endpoint': DEPRECATED, 'X-Canonical-Endpoint': RESEND_WEBHOOK_PATH } },
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated.',
      message: `Configure a single Resend webhook at ${RESEND_WEBHOOK_PATH}`,
      canonical: RESEND_WEBHOOK_PATH,
      deprecated: DEPRECATED,
    },
    { status: 410 },
  );
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import {
  eventTargetsMailbox,
  inboundForwardTo,
  inboundMailboxAddress,
  processInboundEmailEvent,
  verifyResendWebhookSignature,
  type ResendInboundWebhookEvent,
} from '@/lib/email/inbound-email';

export { verifyResendWebhookSignature, inboundMailboxAddress, inboundForwardTo };

export const RESEND_WEBHOOK_PATH = '/api/resend/webhook';

export const RESEND_WEBHOOK_EVENTS = [
  'email.sent',
  'email.delivered',
  'email.bounced',
  'email.failed',
  'email.opened',
  'email.clicked',
  'email.received',
] as const;

export type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: Record<string, unknown>;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function emailIdFromEvent(event: ResendWebhookEvent): string {
  const data = event.data ?? {};
  return str(data.email_id) || str(data.id);
}

function errorFromEvent(event: ResendWebhookEvent): string | null {
  const data = event.data ?? {};
  return (
    str(data.error) ||
    str(data.reason) ||
    str(data.bounce_message) ||
    str(data.failed_reason) ||
    null
  );
}

async function logWebhookAudit(
  admin: SupabaseClient,
  row: {
    kind: string;
    status: string;
    event_type: string;
    provider_message_id?: string | null;
    error_message?: string | null;
    payload: Record<string, unknown>;
  },
) {
  await admin.from('integration_test_events').insert({
    kind: row.kind,
    status: row.status,
    destination: str(row.payload.to) || str(row.payload.from) || null,
    error_message: row.error_message ?? null,
    event_type: row.event_type,
    provider_message_id: row.provider_message_id ?? null,
    payload: row.payload,
    created_at: new Date().toISOString(),
  });
}

async function processEmailReceived(
  admin: SupabaseClient,
  event: ResendWebhookEvent,
  rawPayload: Record<string, unknown>,
  svixEventId: string,
): Promise<Record<string, unknown>> {
  const inboundEvent = event as ResendInboundWebhookEvent;
  const emailId = emailIdFromEvent(event);

  if (!eventTargetsMailbox(inboundEvent)) {
    await logWebhookAudit(admin, {
      kind: 'resend_inbound_received',
      status: 'skipped',
      event_type: event.type,
      provider_message_id: emailId,
      error_message: 'not_target_mailbox',
      payload: rawPayload,
    });
    return { stored: false, forwarded: false, skipped: 'not_target_mailbox' };
  }

  const result = await processInboundEmailEvent(admin, inboundEvent, {
    rawPayload,
    webhookEventId: svixEventId || null,
  });

  const status =
    result.stored && result.forwarded
      ? 'ok'
      : result.stored
        ? 'stored_not_forwarded'
        : result.forwarded
          ? 'forwarded_not_stored'
          : 'failed';

  await logWebhookAudit(admin, {
    kind: 'resend_inbound_received',
    status,
    event_type: event.type,
    provider_message_id: emailId,
    error_message: result.error ?? null,
    payload: { ...rawPayload, stored: result.stored, forwarded: result.forwarded },
  });

  return {
    stored: result.stored,
    forwarded: result.forwarded,
    skipped: result.skipped,
  };
}

function outboxStatusForEvent(type: string): { status: string; failed: boolean } {
  switch (type) {
    case 'email.sent':
    case 'email.delivered':
    case 'email.opened':
    case 'email.clicked':
      return { status: 'sent', failed: false };
    case 'email.bounced':
    case 'email.failed':
      return { status: 'failed', failed: true };
    default:
      return { status: 'sent', failed: false };
  }
}

async function updateNotificationOutbox(
  admin: SupabaseClient,
  emailId: string,
  eventType: string,
  errText: string | null,
): Promise<number> {
  if (!emailId) return 0;
  const { status, failed } = outboxStatusForEvent(eventType);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    provider_message_id: emailId,
    error_message: errText,
    payload: { resend_event: eventType, updated_at: now },
  };
  if (!failed) {
    patch.sent_at = now;
    patch.failed_at = null;
  } else {
    patch.failed_at = now;
  }

  let updated = 0;
  const byProvider = await admin
    .from('notification_outbox')
    .update(patch)
    .eq('provider_message_id', emailId)
    .select('id');
  if (!byProvider.error) updated += (byProvider.data ?? []).length;

  if (updated === 0) {
    const recent = await admin
      .from('notification_outbox')
      .select('id, payload')
      .eq('channel', 'email')
      .order('created_at', { ascending: false })
      .limit(40);
    for (const row of recent.data ?? []) {
      const p = (row as { payload?: Record<string, unknown> }).payload;
      if (p && str(p.resend_email_id) === emailId) {
        const { error } = await admin.from('notification_outbox').update(patch).eq('id', (row as { id: string }).id);
        if (!error) updated += 1;
      }
    }
  }

  return updated;
}

async function updateIntegrationTestFromOutbound(
  admin: SupabaseClient,
  emailId: string,
  eventType: string,
  errText: string | null,
  rawPayload: Record<string, unknown>,
) {
  const { status, failed } = outboxStatusForEvent(eventType);
  const patch: Record<string, unknown> = {
    status: failed ? 'failed' : status === 'sent' ? 'delivered' : status,
    event_type: eventType,
    provider_message_id: emailId || null,
    error_message: errText,
    payload: rawPayload,
  };

  if (emailId) {
    const { data: byProvider } = await admin
      .from('integration_test_events')
      .update(patch)
      .eq('kind', 'resend_test')
      .eq('provider_message_id', emailId)
      .select('id');
    if ((byProvider ?? []).length > 0) return;
  }

  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { data: recent } = await admin
    .from('integration_test_events')
    .select('id')
    .eq('kind', 'resend_test')
    .gte('created_at', oneHourAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent?.id && (eventType === 'email.delivered' || eventType === 'email.sent' || failed)) {
    await admin.from('integration_test_events').update(patch).eq('id', recent.id);
  }
}

async function processOutboundEmailEvent(
  admin: SupabaseClient,
  event: ResendWebhookEvent,
  rawPayload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const emailId = emailIdFromEvent(event);
  const errText = errorFromEvent(event);
  const outboxUpdated = await updateNotificationOutbox(admin, emailId, event.type, errText);
  await updateIntegrationTestFromOutbound(admin, emailId, event.type, errText, rawPayload);

  await logWebhookAudit(admin, {
    kind: 'resend_webhook_outbound',
    status: event.type.replace('email.', ''),
    event_type: event.type,
    provider_message_id: emailId,
    error_message: errText,
    payload: rawPayload,
  });

  return { email_id: emailId, outbox_rows_updated: outboxUpdated, error: errText };
}

export async function handleResendWebhook(
  admin: SupabaseClient,
  event: ResendWebhookEvent,
  opts?: { rawBody?: string; svixEventId?: string | null },
): Promise<{ ok: boolean; type: string; result: Record<string, unknown> }> {
  const rawPayload = { type: event.type, created_at: event.created_at, data: event.data ?? {} };
  const svixEventId = str(opts?.svixEventId);

  try {
    if (event.type === 'email.received') {
      const result = await processEmailReceived(admin, event, rawPayload, svixEventId);
      return { ok: true, type: event.type, result };
    }

    if (
      event.type === 'email.sent' ||
      event.type === 'email.delivered' ||
      event.type === 'email.bounced' ||
      event.type === 'email.failed' ||
      event.type === 'email.opened' ||
      event.type === 'email.clicked'
    ) {
      const result = await processOutboundEmailEvent(admin, event, rawPayload);
      return { ok: true, type: event.type, result };
    }

    await logWebhookAudit(admin, {
      kind: 'resend_webhook_unknown',
      status: 'ignored',
      event_type: event.type,
      payload: rawPayload,
    });

    return { ok: true, type: event.type, result: { ignored: true } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'handler error';
    console.error('[resend-webhook] handle failed', event.type, e);
    return { ok: false, type: event.type, result: { error: msg } };
  }
}

export async function processResendWebhookRequest(
  request: Request,
  admin: SupabaseClient,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const rawBody = await request.text();
  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ResendWebhookEvent;
  } catch {
    return { status: 400, body: { error: 'Invalid JSON' } };
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const verified = verifyResendWebhookSignature(rawBody, {
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
  }, secret);

  if (!verified) {
    console.warn('[resend-webhook] signature verification failed');
    return { status: 401, body: { error: 'Invalid signature' } };
  }

  if (!secret) {
    console.warn('[resend-webhook] RESEND_WEBHOOK_SECRET not set — accepting webhooks without verification');
  }

  const handled = await handleResendWebhook(admin, event, {
    svixEventId: request.headers.get('svix-id'),
  });

  return {
    status: handled.ok ? 200 : 500,
    body: handled,
  };
}

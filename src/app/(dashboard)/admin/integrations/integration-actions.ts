'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { glossBossEmailShell } from '@/lib/email-brand';
import { resendConfigured, sendResendHtml, twilioConfigured } from '@/lib/email-send';
import { parseResendError, resendDomainWarning } from '@/lib/resend-config';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';
import { sendCustomerSms } from '@/lib/sms-send';
import { twilioSendMode } from '@/lib/twilio-config';

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return null;
  return { admin, email: session.user.email ?? null, userId: session.user.id };
}

async function logIntegrationTest(
  admin: NonNullable<Awaited<ReturnType<typeof gate>>>['admin'],
  row: {
    kind: string;
    status: string;
    destination: string | null;
    error_message: string | null;
    actor_id: string;
    provider_message_id?: string | null;
    event_type?: string | null;
  },
) {
  await admin.from('integration_test_events').insert({
    kind: row.kind,
    status: row.status,
    destination: row.destination,
    error_message: row.error_message,
    actor_id: row.actor_id,
    provider_message_id: row.provider_message_id ?? null,
    event_type: row.event_type ?? null,
    created_at: new Date().toISOString(),
  });
}

export async function sendIntegrationTestAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const g = await gate();
  if (!g) return actionErr('Not authorized.');

  const kind = String(formData.get('kind') ?? '').trim();
  const destination = String(formData.get('destination') ?? '').trim();
  let status = 'skipped';
  let error: string | null = null;
  let providerMessageId: string | null = null;

  if (kind === 'resend_test') {
    if (!resendConfigured()) error = 'Resend missing RESEND_API_KEY or RESEND_FROM_EMAIL.';
    else {
      const to = destination.includes('@') ? destination : g.email;
      if (!to) error = 'No test email destination.';
      else {
        const sent = await sendResendHtml({
          to,
          subject: 'Gloss Boss ATX integration test',
          html: glossBossEmailShell({ title: 'Integration test', bodyHtml: '<p style="color:#fafafa;">Resend is connected.</p>' }),
        });
        status = sent.ok ? 'sent' : 'failed';
        error = sent.ok ? null : (sent.error ? parseResendError(sent.error, 403) : resendDomainWarning() ?? 'Resend send failed.');
        providerMessageId = sent.emailId ?? null;

        if (sent.ok) {
          await g.admin.from('notification_outbox').insert({
            kind: 'resend_test',
            channel: 'email',
            provider: 'resend',
            status: 'pending',
            template_key: 'resend_test',
            provider_message_id: sent.emailId ?? null,
            payload: { to, resend_email_id: sent.emailId, subject: 'Gloss Boss ATX integration test' },
            created_at: new Date().toISOString(),
          });
        }
      }
    }
  } else if (kind === 'twilio_test') {
    if (!twilioConfigured()) {
      error = 'Twilio missing SID, token, and Messaging Service SID or From number.';
    } else if (!destination) {
      error = 'Enter a test phone number.';
    } else {
      const sent = await sendCustomerSms({
        db: g.admin,
        kind: 'twilio_test',
        to: destination,
        body: 'Gloss Boss ATX test SMS: Twilio Messaging Service is connected.',
        extraPayload: { integration_test: true },
      });
      const delivery = (sent.deliveryStatus ?? '').toLowerCase();
      const confirmed = delivery === 'delivered' || delivery === 'sent';
      status = sent.skipped ? 'skipped' : sent.ok ? (confirmed ? 'delivered' : 'queued') : 'failed';
      error = sent.ok
        ? [
            `sid=${sent.sid ?? 'none'}`,
            `status=${sent.deliveryStatus ?? 'unknown'}`,
            sent.carrierError ? `carrier=${sent.carrierError}` : null,
            confirmed ? null : 'awaiting_delivery_confirmation',
          ]
            .filter(Boolean)
            .join(' · ')
        : sent.error ?? 'Twilio send failed.';
      providerMessageId = sent.sid ?? null;
    }
  } else {
    return actionErr('Unknown test type.');
  }

  if (error && status === 'skipped') status = 'skipped';

  const testNote =
    kind === 'twilio_test' && providerMessageId
      ? `${error ?? ''} mode=${twilioSendMode()} sid=${providerMessageId}`.trim()
      : error;
  await logIntegrationTest(g.admin, {
    kind,
    status,
    destination: destination || g.email,
    error_message: kind === 'twilio_test' ? testNote : status === 'sent' ? null : testNote,
    actor_id: g.userId,
    provider_message_id: kind === 'resend_test' ? providerMessageId : null,
    event_type: kind === 'resend_test' && providerMessageId ? 'email.sent' : null,
  });

  revalidatePath('/admin/integrations');

  if (status === 'sent') {
    return actionOk(kind === 'twilio_test' ? 'Test SMS sent. Check the handset in a few seconds.' : 'Test email sent.');
  }
  if (status === 'skipped') {
    return actionErr(error ?? 'Send skipped.');
  }
  return actionErr(error ?? 'Send failed.');
}

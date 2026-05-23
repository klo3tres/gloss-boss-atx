'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { glossBossEmailLayout } from '@/lib/email/templates/layout';
import { emailParagraph } from '@/lib/email/templates/layout';
import { fetchTwilioMessageStatus, resendConfigured, sendResendHtml, twilioConfigured } from '@/lib/email-send';
import { parseResendError, resendDomainWarning } from '@/lib/resend-config';
import { actionErr, actionOk, actionWarn, type ActionResult } from '@/lib/action-result';
import { sendCustomerSms } from '@/lib/sms-send';
import { twilioSendMode } from '@/lib/twilio-config';
import { normalizeToE164 } from '@/lib/us-phone';
import { describeTwilioDelivery, integrationTestStatusFromDelivery } from '@/lib/twilio-delivery';

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

export async function checkTwilioMessageStatusAction(sid: string): Promise<{
  ok: boolean;
  sid?: string;
  status?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  error?: string;
}> {
  const g = await gate();
  if (!g) return { ok: false, error: 'Not authorized.' };
  const messageSid = String(sid ?? '').trim();
  if (!messageSid) return { ok: false, error: 'Missing Twilio SID.' };
  if (!twilioConfigured()) return { ok: false, error: 'Twilio not configured.' };

  const res = await fetchTwilioMessageStatus(messageSid);
  if (!res) return { ok: false, error: 'Could not fetch message status from Twilio.' };

  return {
    ok: true,
    sid: messageSid,
    status: res.status,
    errorCode: res.errorCode ?? null,
    errorMessage: res.errorMessage ?? null,
  };
}

export async function sendIntegrationTestAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const g = await gate();
  if (!g) return actionErr('Not authorized.');

  const kind = String(formData.get('kind') ?? '').trim();
  const destinationRaw = String(formData.get('destination') ?? '').trim();
  let status = 'skipped';
  let error: string | null = null;
  let providerMessageId: string | null = null;
  let destinationE164: string | null = null;

  if (kind === 'resend_test') {
    if (!resendConfigured()) error = 'Resend missing RESEND_API_KEY or RESEND_FROM_EMAIL.';
    else {
      const to = destinationRaw.includes('@') ? destinationRaw : g.email;
      if (!to) error = 'No test email destination.';
      else {
        const sent = await sendResendHtml({
          to,
          subject: 'Gloss Boss ATX integration test',
          html: glossBossEmailLayout({
            title: 'Integration test',
            headline: 'Resend connected',
            bodyHtml: emailParagraph('This is a test email from Gloss Boss ATX admin integrations. Resend is configured correctly.', true),
          }),
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
    } else if (!destinationRaw) {
      error = 'Enter a test phone number.';
    } else {
      const phone = normalizeToE164(destinationRaw);
      if (!phone.ok) {
        error = phone.error;
        status = 'failed';
      } else {
        destinationE164 = phone.e164;
        const sent = await sendCustomerSms({
          db: g.admin,
          kind: 'twilio_test',
          to: phone.e164,
          body: 'Gloss Boss ATX test SMS: Twilio Messaging Service is connected.',
          extraPayload: { integration_test: true, destination_e164: phone.e164 },
        });
        providerMessageId = sent.sid ?? null;
        const info = describeTwilioDelivery(sent.deliveryStatus, {
          errorMessage: sent.carrierError,
          sid: sent.sid,
        });
        status = sent.skipped ? 'skipped' : sent.ok ? integrationTestStatusFromDelivery(info) : 'failed';
        error = sent.ok
          ? [
              `destination=${phone.e164}`,
              `sid=${sent.sid ?? 'none'}`,
              info.label,
              sent.carrierError ? `carrier_error=${sent.carrierError}` : null,
              info.needsTollFreeWarning
                ? 'Twilio accepted the SMS but carrier delivery may be blocked until toll-free verification is complete.'
                : null,
              `mode=${twilioSendMode()}`,
            ]
              .filter(Boolean)
              .join(' · ')
          : sent.error ?? 'Twilio send failed.';

        await logIntegrationTest(g.admin, {
          kind,
          status,
          destination: phone.e164,
          error_message: error,
          actor_id: g.userId,
          provider_message_id: providerMessageId,
        });
        revalidatePath('/admin/integrations');

        if (sent.skipped || !sent.ok) return actionErr(error ?? 'Send skipped.');
        if (info.isDelivered) {
          return actionOk(`Delivered to ${phone.e164}. ${error}`);
        }
        if (info.isFailure) return actionErr(error ?? 'SMS failed.');
        return actionWarn(`${info.label}. ${error}`);
      }
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
    destination: kind === 'twilio_test' ? destinationE164 ?? destinationRaw : destinationRaw || g.email,
    error_message: kind === 'twilio_test' ? testNote : status === 'sent' ? null : testNote,
    actor_id: g.userId,
    provider_message_id: kind === 'twilio_test' ? providerMessageId : kind === 'resend_test' ? providerMessageId : null,
    event_type: kind === 'resend_test' && providerMessageId ? 'email.sent' : null,
  });

  revalidatePath('/admin/integrations');

  if (status === 'sent' || status === 'delivered') {
    return actionOk(kind === 'resend_test' ? 'Test email sent.' : `SMS delivered to ${destinationE164 ?? destinationRaw}.`);
  }
  if (status === 'skipped') {
    return actionErr(error ?? 'Send skipped.');
  }
  return actionErr(error ?? 'Send failed.');
}

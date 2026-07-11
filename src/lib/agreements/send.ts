import type { SupabaseClient } from '@supabase/supabase-js';
import { buildAgreementMessages, type AgreementMessageTone } from '@/lib/agreements/messages';
import { ensureAgreementRequest, logAgreementEvent, syncDenormalizedAgreementStatus } from '@/lib/agreements/requests';
import { agreementUrl } from '@/lib/auth/action-link-registry';
import { sendResendHtml, resendConfigured } from '@/lib/email-send';
import { sendCustomerSms } from '@/lib/sms-send';
import { appendSmsCompliance } from '@/lib/customer-notification-cadence';
import { glossBossEmailLayout } from '@/lib/email/templates/layout';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] || 'there';
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return 'your upcoming appointment';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return 'your upcoming appointment';
  }
}

export async function sendAgreementLink(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    channel: 'sms' | 'email' | 'both';
    tone?: AgreementMessageTone;
    actorUserId?: string | null;
    scheduleAt?: string | null;
  },
): Promise<{ ok: boolean; url?: string; error?: string; smsStatus?: string; emailStatus?: string }> {
  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .select('id, access_token, guest_name, guest_email, guest_phone, vehicle_description, scheduled_start, customer_id, status')
    .eq('id', input.appointmentId)
    .maybeSingle();

  if (apptErr || !appt) {
    return { ok: false, error: apptErr?.message ?? 'Appointment not found.' };
  }

  const row = appt as Record<string, unknown>;
  const accessToken = str(row.access_token);
  if (!accessToken) return { ok: false, error: 'Appointment is missing an access token.' };

  const ensured = await ensureAgreementRequest(admin, {
    appointmentId: input.appointmentId,
    customerId: str(row.customer_id) || null,
    accessToken,
    createdBy: input.actorUserId,
  });
  if (!ensured.ok || !ensured.request) {
    return { ok: false, error: ensured.error ?? 'Could not create agreement request.' };
  }

  const url = ensured.url ?? agreementUrl({ appointmentId: input.appointmentId, token: accessToken });
  const tone = input.tone ?? 'professional';
  const messages = buildAgreementMessages({
    firstName: firstName(str(row.guest_name)),
    vehicle: str(row.vehicle_description) || 'your vehicle',
    appointmentWhen: formatWhen(str(row.scheduled_start) || null),
    agreementLink: url,
  });
  const body = messages[tone];

  if (input.scheduleAt) {
    const when = new Date(input.scheduleAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      return { ok: false, error: 'Schedule time must be in the future.' };
    }
    await admin
      .from('agreement_requests')
      .update({
        status: 'scheduled',
        scheduled_send_at: when.toISOString(),
        delivery_channel: input.channel,
        updated_at: new Date().toISOString(),
        meta: { tone, preview: body.slice(0, 280) },
      })
      .eq('id', ensured.request.id);

    // Also enqueue into scheduled_messages when table supports it
    try {
      await admin.from('scheduled_messages').insert({
        rule_key: 'agreement_scheduled_manual',
        appointment_id: input.appointmentId,
        customer_id: str(row.customer_id) || null,
        channel: input.channel === 'both' ? 'sms' : input.channel,
        status: 'pending',
        scheduled_for: when.toISOString(),
        payload: {
          body,
          email_subject: 'Please sign your Gloss Boss ATX service acknowledgment',
          email_body: body,
          agreement_link: url,
          agreement_request_id: ensured.request.id,
        },
      });
    } catch (e) {
      console.warn('[sendAgreementLink] schedule insert', e);
    }

    await syncDenormalizedAgreementStatus(admin, {
      appointmentId: input.appointmentId,
      requestId: ensured.request.id,
      status: 'scheduled',
    });
    await logAgreementEvent(admin, {
      requestId: ensured.request.id,
      appointmentId: input.appointmentId,
      eventType: 'agreement_scheduled',
      actorUserId: input.actorUserId,
      detail: when.toISOString(),
    });
    return { ok: true, url, smsStatus: 'scheduled', emailStatus: 'scheduled' };
  }

  let smsStatus = 'skipped';
  let emailStatus = 'skipped';
  let failure: string | undefined;

  if (input.channel === 'sms' || input.channel === 'both') {
    const phone = str(row.guest_phone);
    if (!phone) {
      smsStatus = 'missing_phone';
    } else {
      const sms = await sendCustomerSms({
        db: admin,
        kind: 'agreement_request',
        template_key: `agreement_${tone}`,
        to: phone,
        body: appendSmsCompliance(body),
        requireConsent: false, // transactional service acknowledgment
        customer_id: str(row.customer_id) || undefined,
        appointment_id: input.appointmentId,
      });
      smsStatus = sms.ok ? 'sent' : 'failed';
      if (!sms.ok) failure = sms.error ?? 'SMS failed';
    }
  }

  if (input.channel === 'email' || input.channel === 'both') {
    const email = str(row.guest_email);
    if (!email) {
      emailStatus = 'missing_email';
    } else if (!resendConfigured()) {
      emailStatus = 'not_configured';
    } else {
      const html = glossBossEmailLayout({
        title: 'Service acknowledgment',
        bodyHtml: `<p>${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(url, `<a href="${url}">${url}</a>`)}</p><p><a href="${url}" style="display:inline-block;background:#d4af37;color:#000;padding:12px 18px;border-radius:10px;font-weight:800;text-decoration:none">Review &amp; sign</a></p>`,
      });
      const sent = await sendResendHtml({
        to: email,
        subject: 'Please sign your Gloss Boss ATX service acknowledgment',
        html,
      });
      emailStatus = sent.ok ? 'sent' : 'failed';
      if (!sent.ok) failure = sent.error ?? 'Email failed';
    }
  }

  const delivered = smsStatus === 'sent' || emailStatus === 'sent';
  const now = new Date().toISOString();
  await admin
    .from('agreement_requests')
    .update({
      status: delivered ? 'sent' : 'failed_delivery',
      sent_at: delivered ? now : null,
      delivered_at: delivered ? now : null,
      delivery_channel: input.channel,
      failure_reason: failure ?? null,
      updated_at: now,
      meta: { tone, smsStatus, emailStatus },
    })
    .eq('id', ensured.request.id);

  await syncDenormalizedAgreementStatus(admin, {
    appointmentId: input.appointmentId,
    requestId: ensured.request.id,
    status: delivered ? 'sent' : 'failed_delivery',
  });
  await logAgreementEvent(admin, {
    requestId: ensured.request.id,
    appointmentId: input.appointmentId,
    eventType: delivered ? 'agreement_sent' : 'delivery_failed',
    actorUserId: input.actorUserId,
    detail: failure,
    meta: { smsStatus, emailStatus, channel: input.channel },
  });

  if (!delivered) {
    return { ok: false, url, error: failure ?? 'Delivery failed.', smsStatus, emailStatus };
  }
  return { ok: true, url, smsStatus, emailStatus };
}

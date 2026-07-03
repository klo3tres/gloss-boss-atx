import type { SupabaseClient } from '@supabase/supabase-js';
import { resendConfigured, sendResendHtml } from '@/lib/email-send';
import { bookingConfirmationEmailHtml } from '@/lib/email/templates/booking';
import { resolveJobPricing } from '@/lib/job-pricing-display';
import { resolveOrderLedger } from '@/lib/order-ledger';
import { sendCustomerSms } from '@/lib/sms-send';
import { notifyBusinessNewBookingQueued } from '@/lib/notifications-placeholder';
import { emitOwnerNotification } from '@/lib/titan/owner-notification-router';
import { vehiclesFromRow, type Row } from '@/lib/work-order-resolve';
import { describeTwilioDelivery } from '@/lib/twilio-delivery';
import { buildCustomerPortalAccessUrl, ensurePortalAccessExpiry } from '@/lib/customer-portal-access';
import { markPortalLinkCreated, markPortalLinkSent } from '@/lib/confirmation-delivery-status';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function money(cents: number) {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function whenChicago(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function serviceLabel(job: Row) {
  const slug = str(job.service_slug).replace(/-/g, ' ');
  return slug ? slug.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Mobile detail';
}

function fullAddress(job: Row) {
  return [job.service_address, job.service_city, job.service_state, job.service_zip].map(str).filter(Boolean).join(', ');
}

function vehicleSummary(job: Row) {
  const vehicles = vehiclesFromRow(job);
  if (vehicles.length === 0) return str(job.vehicle_description) || 'Your vehicle(s)';
  return vehicles.map((v, i) => str(v.vehicle_description || v.description) || `Vehicle ${i + 1}`).join(' · ');
}

function durationLabel(job: Row) {
  const mins = typeof job.estimated_duration_minutes === 'number' ? job.estimated_duration_minutes : 0;
  if (mins > 0) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h} hr ${m} min`;
    if (h) return `${h} hr`;
    return `${m} min`;
  }
  const start = str(job.scheduled_start);
  const end = str(job.estimated_end);
  if (start && end) {
    const diff = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
    if (diff > 0) return `${diff} min`;
  }
  return 'Approx. 2–3 hours';
}

export type BookingConfirmationContext = {
  appointmentId: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  service: string;
  vehicles: string;
  whenLabel: string;
  whenIso: string;
  address: string;
  duration: string;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  smsBody: string;
  emailHtml: string;
  emailSubject: string;
  calendarUrl: string;
  confirmationUrl: string;
  portalUrl: string;
  workOrderId: string;
  customerId: string | null;
  priceSource: string;
};

export async function loadBookingConfirmationContext(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<{ ok: true; ctx: BookingConfirmationContext } | { ok: false; error: string }> {
  const id = str(appointmentId);
  if (!id) return { ok: false, error: 'Missing appointment' };

  const { data: job } = await admin.from('appointments').select('*').eq('id', id).maybeSingle();
  if (!job) return { ok: false, error: 'Appointment not found' };
  const row = job as Row;

  const { data: payments } = await admin
    .from('payments')
    .select('*')
    .eq('appointment_id', id)
    .order('paid_at', { ascending: false })
    .limit(20);

  const ledger = await resolveOrderLedger(admin, { appointmentId: id });
  const pricing = ledger?._pricing ?? resolveJobPricing(row, (payments ?? []) as Row[]);
  const totalCents = ledger?.totals.finalTotalCents ?? pricing.finalTotalCents;
  const balanceCents = ledger?.totals.balanceDueCents ?? pricing.remainingBalanceCents;
  const depositPaidCents = ledger?.totals.depositPaidCents ?? pricing.depositPaidCents;
  const depositRequiredCents = pricing.depositCents;
  const priceSource = pricing.priceSource ?? 'engine_recompute';

  const whenIso = str(row.scheduled_start) || new Date().toISOString();
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
  const token = str(row.access_token);
  const confirmationUrl = token
    ? `${base}/book/confirmation?appointment_id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`
    : `${base}/book/confirmation?appointment_id=${encodeURIComponent(id)}`;
  const portalUrl = token ? buildCustomerPortalAccessUrl(id, token) : `${base}/dashboard`;
  await ensurePortalAccessExpiry(admin, id, whenIso);
  await markPortalLinkCreated(admin, id);

  const ctx: BookingConfirmationContext = {
    appointmentId: id,
    workOrderId: id,
    customerId: str(row.customer_id) || null,
    guestName: str(row.guest_name) || 'Customer',
    guestEmail: str(row.guest_email).toLowerCase(),
    guestPhone: str(row.guest_phone),
    service: serviceLabel(row),
    vehicles: vehicleSummary(row),
    whenLabel: whenChicago(whenIso),
    whenIso,
    address: fullAddress(row),
    duration: durationLabel(row),
    totalCents,
    depositCents: depositPaidCents > 0 ? depositPaidCents : depositRequiredCents,
    balanceCents,
    priceSource,
    calendarUrl: `${base}/api/calendar/appointment/${id}`,
    confirmationUrl,
    portalUrl,
    emailSubject: 'Gloss Boss ATX — Your appointment is confirmed',
    emailHtml: bookingConfirmationEmailHtml({
      guestName: str(row.guest_name) || 'Customer',
      whenLabel: whenChicago(whenIso),
      service: serviceLabel(row),
      total: money(totalCents),
      deposit: money(depositPaidCents > 0 ? depositPaidCents : depositRequiredCents),
      vehicles: vehicleSummary(row),
      serviceAddress: fullAddress(row),
      remainingBalance: money(balanceCents),
      duration: durationLabel(row),
      calendarUrl: `${base}/api/calendar/appointment/${id}`,
      confirmationUrl,
      portalUrl,
    }),
    smsBody: buildConfirmationSms({
      guestName: str(row.guest_name) || 'Customer',
      whenLabel: whenChicago(whenIso),
      service: serviceLabel(row),
      vehicles: vehicleSummary(row),
      address: fullAddress(row),
      totalCents,
      depositCents: depositPaidCents > 0 ? depositPaidCents : depositRequiredCents,
      balanceCents,
      portalUrl,
    }),
  };

  return { ok: true, ctx };
}

export function buildConfirmationSms(details: {
  guestName: string;
  whenLabel: string;
  service: string;
  vehicles: string;
  address: string;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  portalUrl: string;
}) {
  return `Gloss Boss ATX: Your detail is confirmed for ${details.whenLabel}. View your appointment, updates, loyalty rewards, referral link, and photos here: ${details.portalUrl}`;
}

async function logEmailOutbox(
  admin: SupabaseClient,
  row: {
    appointment_id: string;
    status: string;
    error_message?: string | null;
    skipped_reason?: string | null;
    provider_message_id?: string | null;
    payload: Record<string, unknown>;
  },
) {
  await admin.from('notification_outbox').insert({
    appointment_id: row.appointment_id,
    kind: 'booking_confirmation',
    channel: 'email',
    provider: 'resend',
    status: row.status,
    template_key: 'booking_confirmation',
    error_message: row.error_message ?? null,
    skipped_reason: row.skipped_reason ?? null,
    provider_message_id: row.provider_message_id ?? null,
    payload: row.payload,
    created_at: new Date().toISOString(),
  });
}

export type SendBookingConfirmationResult = {
  ok: boolean;
  email?: { status: string; error?: string; skippedReason?: string };
  sms?: { status: string; error?: string; skippedReason?: string; twilioDetail?: string };
  error?: string;
};

export async function sendBookingConfirmation(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    customEmailHtml?: string;
    customEmailSubject?: string;
    customSmsBody?: string;
    skipOwnerNotify?: boolean;
    channel?: 'both' | 'email' | 'sms';
  },
): Promise<SendBookingConfirmationResult> {
  const loaded = await loadBookingConfirmationContext(admin, input.appointmentId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const ctx = loaded.ctx;

  let emailStatus = 'skipped';
  let emailError: string | undefined;
  let emailSkipped: string | undefined;

  const html = input.customEmailHtml ?? ctx.emailHtml;
  const subject = input.customEmailSubject ?? ctx.emailSubject;

  const sendEmail = input.channel !== 'sms';
  const sendSms = input.channel !== 'email';

  if (sendEmail && ctx.guestEmail.includes('@')) {
    if (resendConfigured()) {
      const sent = await sendResendHtml({ to: ctx.guestEmail, subject, html });
      emailStatus = sent.ok ? 'sent' : 'failed';
      emailError = sent.ok ? undefined : sent.error ?? 'Resend failed';
      await logEmailOutbox(admin, {
        appointment_id: ctx.appointmentId,
        status: emailStatus,
        error_message: emailError ?? null,
        provider_message_id: sent.ok ? sent.emailId ?? null : null,
        payload: {
          to: ctx.guestEmail,
          subject,
          body_html: html.slice(0, 8000),
          body_preview: html.replace(/<[^>]+>/g, ' ').slice(0, 500),
          total_cents: ctx.totalCents,
          price_source: ctx.priceSource,
        },
      });
    } else {
      emailStatus = 'skipped';
      emailSkipped = 'Resend not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).';
      await logEmailOutbox(admin, {
        appointment_id: ctx.appointmentId,
        status: 'skipped',
        skipped_reason: emailSkipped,
        payload: { to: ctx.guestEmail, subject, body_preview: html.replace(/<[^>]+>/g, ' ').slice(0, 500) },
      });
    }
  } else if (!sendEmail) {
    emailSkipped = 'Email resend not requested.';
  } else {
    emailSkipped = 'No customer email on file.';
  }

  let smsStatus = 'skipped';
  let smsError: string | undefined;
  let smsSkipped: string | undefined;
  let twilioDetail: string | undefined;

  const smsBody = input.customSmsBody ?? ctx.smsBody;
  if (sendSms && ctx.guestPhone) {
    const smsResult = await sendCustomerSms({
      db: admin,
      kind: 'booking_confirmation',
      template_key: 'booking_confirmation',
      to: ctx.guestPhone,
      appointment_id: ctx.appointmentId,
      body: smsBody,
      requireConsent: false,
      extraPayload: {
        guest_name: ctx.guestName,
        when_iso: ctx.whenIso,
        body_full: smsBody,
      },
    });
    if (smsResult.skipped) {
      smsStatus = 'skipped';
      smsSkipped = smsResult.error ?? 'SMS skipped';
    } else if (smsResult.ok) {
      smsStatus = smsResult.deliveryStatus === 'delivered' ? 'delivered' : 'sent';
      twilioDetail = describeTwilioDelivery(smsResult.deliveryStatus, {
        errorMessage: smsResult.carrierError ?? smsResult.error,
        sid: smsResult.sid,
      }).detail;
    } else {
      smsStatus = 'failed';
      smsError = smsResult.error ?? 'Twilio send failed';
      twilioDetail = describeTwilioDelivery(smsResult.deliveryStatus ?? 'failed', {
        errorMessage: smsResult.carrierError ?? smsResult.error,
        sid: smsResult.sid,
      }).detail;
      if (/trial|verified|21608|21211|21408/i.test(smsError)) {
        smsError = `${smsError} — Twilio trial accounts can only SMS verified numbers. Verify the recipient in Twilio Console or upgrade the account.`;
      }
    }
  } else if (!sendSms) {
    smsSkipped = 'SMS resend not requested.';
  } else {
    smsSkipped = 'No customer phone on file.';
  }

  const anySent = emailStatus === 'sent' || smsStatus === 'sent' || smsStatus === 'delivered';
  const anyFailed = emailStatus === 'failed' || smsStatus === 'failed';

  if (anySent) {
    await markPortalLinkSent(admin, ctx.appointmentId);
  }

  if (!input.skipOwnerNotify) {
    try {
      await notifyBusinessNewBookingQueued({
        appointmentId: ctx.appointmentId,
        guestName: ctx.guestName,
        guestEmail: ctx.guestEmail,
        guestPhone: ctx.guestPhone,
        whenIso: ctx.whenIso,
        totalCents: ctx.totalCents,
        depositCents: ctx.depositCents,
        balanceCents: ctx.balanceCents,
        vehicles: ctx.vehicles,
        serviceAddress: ctx.address,
        extraNote: 'Customer confirmation sent from work order.',
      });
    } catch {
      /* owner notify is best-effort */
    }
  }

  const activityTitle = anyFailed
    ? 'Customer confirmation failed'
    : anySent
      ? `Customer confirmation sent — ${money(ctx.totalCents)} total`
      : 'Customer confirmation skipped';
  const activityBody = [
    `${ctx.guestName} · ${ctx.whenLabel}`,
    `Total: ${money(ctx.totalCents)} · Balance: ${money(ctx.balanceCents)} · Source: ${ctx.priceSource}`,
    ctx.guestEmail ? `Email: ${emailStatus}${emailError ? ` — ${emailError}` : ''}` : 'Email: no address',
    ctx.guestPhone ? `SMS: ${smsStatus}${smsError ? ` — ${smsError}` : smsSkipped ? ` — ${smsSkipped}` : ''}` : 'SMS: no phone',
    twilioDetail ? `Twilio: ${twilioDetail}` : '',
  ].join('\n');

  await emitOwnerNotification(admin, {
    eventType: anyFailed ? 'delivery_failed' : 'new_booking',
    title: activityTitle,
    body: activityBody,
    source: anyFailed ? 'customer_confirmation_failed' : 'customer_confirmation_sent',
    relatedType: 'appointment',
    relatedId: ctx.appointmentId,
    relatedUrl: `/admin/work-orders/${ctx.appointmentId}?shell=admin`,
    bypassQuietHours: anyFailed,
    emailStatus: emailStatus === 'sent' ? 'sent' : emailStatus === 'failed' ? 'failed' : 'skipped',
    smsStatus: smsStatus === 'sent' || smsStatus === 'delivered' ? 'sent' : smsStatus === 'failed' ? 'failed' : 'skipped',
  });

  return {
    ok: anySent || (!anyFailed && emailStatus === 'skipped' && smsStatus === 'skipped'),
    email: { status: emailStatus, error: emailError, skippedReason: emailSkipped },
    sms: { status: smsStatus, error: smsError, skippedReason: smsSkipped, twilioDetail },
  };
}

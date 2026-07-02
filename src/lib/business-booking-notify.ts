import type { SupabaseClient } from '@supabase/supabase-js';
import { businessNotifyDestination, resendConfigured, sendResendHtml } from '@/lib/email-send';
import { glossBossEmailLayout } from '@/lib/email/templates/layout';
import { sendCustomerSms } from '@/lib/sms-send';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveOwnerNotifyContact } from '@/lib/owner-contact';

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://glossbossatx.com').replace(/\/$/, '');
}

export function businessNotifyPhone(): string | null {
  const a = process.env.BUSINESS_NOTIFY_PHONE?.trim();
  const b = process.env.OWNER_PHONE?.trim();
  const c = process.env.BUSINESS_OWNER_PHONE?.trim();
  return a || b || c || null;
}

function adminWorkOrderUrl(appointmentId: string) {
  if (appointmentId === '00000000-0000-0000-0000-000000000000') return `${appBaseUrl()}/admin`;
  return `${appBaseUrl()}/admin/work-orders/${appointmentId}`;
}

export type OwnerBookingEventKind =
  | 'new_booking'
  | 'free_booking'
  | 'pay_later'
  | 'deposit_paid'
  | 'paid_full'
  | 'payment_received'
  | 'quote_request'
  | 'ceramic_quote'
  | 'gift_card'
  | 'payment_failed'
  | 'cancelled'
  | 'rescheduled'
  | 'job_completed'
  | 'receipt_sent'
  | 'credit_issued'
  | 'credit_redeemed'
  | 'reward_earned'
  | 'webhook_failed';

const EVENT_COPY: Record<
  OwnerBookingEventKind,
  { headline: string; subjectPrefix: string; smsLead: string }
> = {
  new_booking: { headline: 'New booking received', subjectPrefix: 'New booking', smsLead: 'New booking' },
  free_booking: { headline: 'FREE / comp booking', subjectPrefix: 'FREE booking', smsLead: 'FREE comp booking' },
  pay_later: { headline: 'Pay later booking', subjectPrefix: 'Pay later booking', smsLead: 'Pay later booking' },
  deposit_paid: { headline: 'Deposit received', subjectPrefix: 'Deposit paid', smsLead: 'Deposit paid' },
  paid_full: { headline: 'Paid in full', subjectPrefix: 'Paid in full', smsLead: 'Paid in full' },
  payment_received: { headline: 'Payment received', subjectPrefix: 'Payment received', smsLead: 'Payment received' },
  quote_request: { headline: 'Quote / contact request', subjectPrefix: 'Quote request', smsLead: 'Quote request' },
  ceramic_quote: { headline: 'Ceramic coating inquiry', subjectPrefix: 'Ceramic quote', smsLead: 'Ceramic quote' },
  gift_card: { headline: 'Gift card purchase', subjectPrefix: 'Gift card', smsLead: 'Gift card sold' },
  payment_failed: { headline: 'Payment failed', subjectPrefix: 'Payment failed', smsLead: 'Payment FAILED' },
  cancelled: { headline: 'Booking cancelled', subjectPrefix: 'Booking cancelled', smsLead: 'Booking CANCELLED' },
  rescheduled: { headline: 'Booking rescheduled', subjectPrefix: 'Booking rescheduled', smsLead: 'Booking RESCHEDULED' },
  job_completed: { headline: 'Job completed', subjectPrefix: 'Job completed', smsLead: 'Job COMPLETED' },
  receipt_sent: { headline: 'Receipt sent to customer', subjectPrefix: 'Receipt sent', smsLead: 'Receipt sent' },
  credit_issued: { headline: 'Customer credit issued', subjectPrefix: 'Credit issued', smsLead: 'Credit ISSUED' },
  credit_redeemed: { headline: 'Customer credit redeemed', subjectPrefix: 'Credit redeemed', smsLead: 'Credit REDEEMED' },
  reward_earned: { headline: 'Loyalty reward earned', subjectPrefix: 'Reward earned', smsLead: 'Reward EARNED' },
  webhook_failed: { headline: 'Stripe webhook failed', subjectPrefix: 'Webhook failed', smsLead: 'Webhook FAILED' },
};

async function insertOutbox(
  admin: SupabaseClient | null,
  row: {
    appointment_id: string;
    kind: string;
    channel: string;
    status: string;
    provider?: string;
    template_key?: string;
    provider_message_id?: string | null;
    error_message?: string | null;
    skipped_reason?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  if (!admin) return;
  try {
    await admin.from('notification_outbox').insert({
      ...row,
      provider: row.provider ?? (row.channel === 'email' ? 'resend' : row.channel === 'sms' ? 'twilio' : 'system'),
      template_key: row.template_key ?? row.kind,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[business-booking-notify] outbox', e);
  }
}

/** Owner phone/SMS + email — branded, ICS link, work order link, outbox. */
export async function notifyBusinessNewBookingFull(params: {
  eventKind?: OwnerBookingEventKind;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  whenIso: string;
  totalCents: number;
  depositCents: number;
  balanceCents?: number;
  paidCents?: number;
  appointmentId: string;
  vehicles: string;
  bookingNumber?: string | null;
  serviceAddress?: string | null;
  comped?: boolean;
  extraNote?: string | null;
}): Promise<void> {
  const admin = tryCreateAdminSupabase();
  const whenLabel = new Date(params.whenIso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const kind = params.eventKind ?? (params.comped ? 'free_booking' : 'new_booking');
  const copy = EVENT_COPY[kind];
  const dashUrl = adminWorkOrderUrl(params.appointmentId);
  const icsUrl =
    params.appointmentId !== '00000000-0000-0000-0000-000000000000'
      ? `${appBaseUrl()}/api/calendar/appointment/${params.appointmentId}`
      : null;
  const ref =
    params.bookingNumber?.trim() ||
    (params.appointmentId !== '00000000-0000-0000-0000-000000000000'
      ? params.appointmentId.slice(0, 8).toUpperCase()
      : 'ALERT');
  const total = money(params.totalCents);
  const deposit = money(params.depositCents);
  const balance =
    typeof params.balanceCents === 'number' ? money(params.balanceCents) : money(Math.max(0, params.totalCents - params.depositCents));
  const paid = typeof params.paidCents === 'number' ? money(params.paidCents) : null;
  const addr = params.serviceAddress?.trim() || '';

  const guest = params.guestName.trim() || 'Customer';
  const serviceHint = params.vehicles.replace(/\s+/g, ' ').trim().slice(0, 48);
  const eventLabel =
    kind === 'new_booking'
      ? `Booking created: ${guest}${serviceHint ? ` — ${serviceHint}` : ''}`
      : kind === 'deposit_paid'
        ? `Deposit received: ${guest}`
        : kind === 'paid_full'
          ? `Paid in full: ${guest}`
          : kind === 'rescheduled'
            ? `Booking rescheduled: ${guest}`
            : kind === 'cancelled'
              ? `Booking cancelled: ${guest}`
              : `${copy.headline}: ${guest}`;

  const smsBody = [
    `Gloss Boss ATX: ${eventLabel}${whenLabel ? `, ${whenLabel}` : ''}${paid ? `, paid ${paid}` : `, total ${total}`}${balance && balance !== '$0.00' ? `, balance ${balance}` : ''}.`,
    `View: ${dashUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const ownerContact = await resolveOwnerNotifyContact(admin);
  const ownerPhone = ownerContact.phone ?? businessNotifyPhone();
  if (ownerPhone) {
    try {
      const sms = await sendCustomerSms({
        db: admin,
        kind: kind,
        template_key: kind,
        to: ownerPhone,
        appointment_id: params.appointmentId,
        body: smsBody,
        requireConsent: false,
        extraPayload: { dashboard_url: dashUrl, total_cents: params.totalCents, booking_ref: ref, owner_alert: true },
      });
      await insertOutbox(admin, {
        appointment_id: params.appointmentId,
        kind,
        channel: 'sms',
        status: sms.ok ? 'sent' : sms.skipped ? 'skipped' : 'failed',
        provider_message_id: sms.sid ?? null,
        error_message: sms.error ?? null,
        skipped_reason: sms.skipped ? 'twilio_not_configured' : null,
        payload: { to: ownerPhone, dashboard_url: dashUrl },
      });
    } catch (e) {
      console.warn('[business-booking-notify] owner sms', e);
      await insertOutbox(admin, {
        appointment_id: params.appointmentId,
        kind,
        channel: 'sms',
        status: 'failed',
        error_message: e instanceof Error ? e.message : String(e),
        payload: { to: ownerPhone },
      });
    }
  } else {
    await insertOutbox(admin, {
      appointment_id: params.appointmentId,
      kind: 'admin_new_booking',
      channel: 'sms',
      status: 'skipped',
      skipped_reason: 'Set BUSINESS_NOTIFY_PHONE or OWNER_PHONE for owner alerts.',
      payload: {},
    });
  }

  const emailTo = ownerContact.email ?? businessNotifyDestination();

  if (!resendConfigured()) {
    await insertOutbox(admin, {
      appointment_id: params.appointmentId,
      kind: 'admin_new_booking',
      channel: 'email',
      status: 'skipped',
      skipped_reason: 'Resend not configured.',
      payload: { to: emailTo },
    });
  } else {
    const inner = `
    <p style="margin:0 0 16px;font-size:15px;color:#fafafa;">${copy.headline} — review in your dashboard.</p>
    <div style="border:1px solid #3f3f46;border-radius:10px;padding:16px;">
      <p style="margin:0;font-size:12px;color:#fcd34d;text-transform:uppercase;letter-spacing:0.08em;">Ref ${ref}</p>
      <p style="margin:12px 0 0;font-size:16px;color:#fafafa;"><strong>${params.guestName}</strong></p>
      <p style="margin:8px 0 0;font-size:14px;color:#d4d4d8;">${params.guestEmail} · ${params.guestPhone}</p>
      <p style="margin:8px 0 0;font-size:14px;color:#a1a1aa;">When: ${whenLabel}</p>
      <p style="margin:8px 0 0;font-size:14px;color:#fcd34d;">Total ${total} · Deposit ${deposit} · Balance ${balance}${paid ? ` · Paid ${paid}` : ''}</p>
      <p style="margin:8px 0 0;font-size:13px;color:#a1a1aa;">${params.vehicles}</p>
      ${addr ? `<p style="margin:8px 0 0;font-size:13px;color:#a1a1aa;">${addr}</p>` : ''}
      ${params.comped ? '<p style="margin:8px 0 0;font-size:13px;color:#86efac;">FREE / comp — $0.00</p>' : ''}
      ${params.extraNote ? `<p style="margin:8px 0 0;font-size:13px;color:#fcd34d;">${params.extraNote}</p>` : ''}
    </div>
    ${icsUrl ? `<p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">Calendar: <a href="${icsUrl}" style="color:#fcd34d;">Add to calendar (.ics)</a> — Google Calendar API not required.</p>` : ''}
    <p style="margin:20px 0 0;text-align:center;">
      <a href="${dashUrl}" style="display:inline-block;padding:14px 28px;background:#d4a64d;color:#000;font-weight:800;text-decoration:none;border-radius:8px;font-size:14px;">Open work order</a>
    </p>`;
    const html = glossBossEmailLayout({
      title: copy.headline,
      preview: `${copy.subjectPrefix} ${total}`,
      headline: copy.headline,
      bodyHtml: inner,
    });

    try {
      const sent = await sendResendHtml({
        to: emailTo,
        subject: `Gloss Boss ATX — ${copy.subjectPrefix} ${ref}: ${params.guestName}`,
        html,
      });
      await insertOutbox(admin, {
        appointment_id: params.appointmentId,
        kind,
        channel: 'email',
        status: sent.ok ? 'sent' : 'failed',
        error_message: sent.ok ? null : sent.error ?? 'send failed',
        payload: { to: emailTo, dashboard_url: dashUrl, ics_url: icsUrl, calendar_fallback: Boolean(icsUrl), event_kind: kind },
      });
    } catch (e) {
      await insertOutbox(admin, {
        appointment_id: params.appointmentId,
        kind: 'admin_new_booking',
        channel: 'email',
        status: 'failed',
        error_message: e instanceof Error ? e.message : String(e),
        payload: { to: emailTo },
      });
    }
  }

  const eventType =
    kind === 'cancelled'
      ? 'booking_canceled'
      : kind === 'job_completed'
        ? 'work_order_completed'
        : ['payment_received', 'deposit_paid', 'paid_full'].includes(kind)
          ? 'payment_received'
          : 'new_booking';

  if (admin) {
    const { emitOwnerNotification } = await import('@/lib/titan/owner-notification-router');
    void emitOwnerNotification(admin, {
      eventType,
      title: copy.headline,
      body: `${params.guestName} · ${whenLabel} · ${total}`,
      source: 'bookings',
      relatedType: 'appointment',
      relatedId: params.appointmentId,
      relatedUrl: dashUrl,
      emailStatus: 'sent',
      smsStatus: ownerPhone ? 'sent' : 'skipped',
    });
  }
}

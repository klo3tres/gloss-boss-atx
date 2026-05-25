import type { SupabaseClient } from '@supabase/supabase-js';
import { businessNotifyDestination, resendConfigured, sendResendHtml } from '@/lib/email-send';
import { glossBossEmailLayout } from '@/lib/email/templates/layout';
import { sendCustomerSms } from '@/lib/sms-send';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

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
  return `${appBaseUrl()}/admin/work-orders/${appointmentId}`;
}

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

/** Owner phone/SMS + email when a customer books — includes total and dashboard link. */
export async function notifyBusinessNewBookingFull(params: {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  whenIso: string;
  totalCents: number;
  depositCents: number;
  appointmentId: string;
  vehicles: string;
  bookingNumber?: string | null;
  serviceAddress?: string | null;
  comped?: boolean;
}): Promise<void> {
  const admin = tryCreateAdminSupabase();
  const whenLabel = new Date(params.whenIso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const dashUrl = adminWorkOrderUrl(params.appointmentId);
  const icsUrl = `${appBaseUrl()}/api/calendar/appointment/${params.appointmentId}`;
  const ref = params.bookingNumber?.trim() || params.appointmentId.slice(0, 8).toUpperCase();
  const total = money(params.totalCents);
  const deposit = money(params.depositCents);
  const addr = params.serviceAddress?.trim() || '';

  const smsBody = [
    'Gloss Boss ATX — New booking',
    `${params.guestName.trim() || 'Customer'}`,
    whenLabel,
    `Total ${total} · Deposit ${deposit}`,
    params.vehicles.slice(0, 60),
    `View: ${dashUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const ownerPhone = businessNotifyPhone();
  if (ownerPhone) {
    try {
      const sms = await sendCustomerSms({
        db: admin,
        kind: 'admin_new_booking',
        template_key: 'admin_new_booking',
        to: ownerPhone,
        appointment_id: params.appointmentId,
        body: smsBody,
        extraPayload: { dashboard_url: dashUrl, total_cents: params.totalCents, booking_ref: ref },
      });
      await insertOutbox(admin, {
        appointment_id: params.appointmentId,
        kind: 'admin_new_booking',
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
        kind: 'admin_new_booking',
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

  const emailTo = businessNotifyDestination();
  if (!emailTo) {
    await insertOutbox(admin, {
      appointment_id: params.appointmentId,
      kind: 'admin_new_booking',
      channel: 'email',
      status: 'skipped',
      skipped_reason: 'Set CONTACT_NOTIFY_EMAIL or BUSINESS_NOTIFY_EMAIL.',
      payload: {},
    });
    return;
  }

  if (!resendConfigured()) {
    await insertOutbox(admin, {
      appointment_id: params.appointmentId,
      kind: 'admin_new_booking',
      channel: 'email',
      status: 'skipped',
      skipped_reason: 'Resend not configured.',
      payload: { to: emailTo },
    });
    return;
  }

  const inner = `
    <p style="margin:0 0 16px;font-size:15px;color:#fafafa;">New online booking — open your dashboard to review.</p>
    <div style="border:1px solid #3f3f46;border-radius:10px;padding:16px;">
      <p style="margin:0;font-size:12px;color:#fcd34d;text-transform:uppercase;letter-spacing:0.08em;">Booking ${ref}</p>
      <p style="margin:12px 0 0;font-size:16px;color:#fafafa;"><strong>${params.guestName}</strong></p>
      <p style="margin:8px 0 0;font-size:14px;color:#d4d4d8;">${params.guestEmail} · ${params.guestPhone}</p>
      <p style="margin:8px 0 0;font-size:14px;color:#a1a1aa;">When: ${whenLabel}</p>
      <p style="margin:8px 0 0;font-size:14px;color:#fcd34d;">Total ${total} · Deposit ${deposit}</p>
      <p style="margin:8px 0 0;font-size:13px;color:#a1a1aa;">${params.vehicles}</p>
      ${addr ? `<p style="margin:8px 0 0;font-size:13px;color:#a1a1aa;">${addr}</p>` : ''}
      ${params.comped ? '<p style="margin:8px 0 0;font-size:13px;color:#86efac;">FREE / comp booking</p>' : ''}
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">Calendar: <a href="${icsUrl}" style="color:#fcd34d;">Add to calendar (.ics)</a> — Google Calendar API not required.</p>
    <p style="margin:20px 0 0;text-align:center;">
      <a href="${dashUrl}" style="display:inline-block;padding:14px 28px;background:#d4a64d;color:#000;font-weight:800;text-decoration:none;border-radius:8px;font-size:14px;">Open work order</a>
    </p>`;
  const html = glossBossEmailLayout({
    title: 'New booking',
    preview: `New booking ${total}`,
    headline: 'New booking received',
    bodyHtml: inner,
  });

  try {
    const sent = await sendResendHtml({
      to: emailTo,
      subject: `Gloss Boss ATX — New booking ${ref}: ${params.guestName}`,
      html,
    });
    await insertOutbox(admin, {
      appointment_id: params.appointmentId,
      kind: 'admin_new_booking',
      channel: 'email',
      status: sent.ok ? 'sent' : 'failed',
      error_message: sent.ok ? null : sent.error ?? 'send failed',
      payload: { to: emailTo, dashboard_url: dashUrl, ics_url: icsUrl, calendar_fallback: true },
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

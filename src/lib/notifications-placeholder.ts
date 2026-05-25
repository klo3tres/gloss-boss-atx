import {
  sendAppointmentReminderIfConfigured,
  sendBookingConfirmationEmailIfConfigured,
  sendJobCompletedEmailIfConfigured,
  sendJobStartedEmailIfConfigured,
  resendConfigured,
  sendResendHtml,
} from '@/lib/email-send';
import { bookingConfirmationEmailHtml } from '@/lib/email/templates/booking';
import { sendCustomerSms } from '@/lib/sms-send';
import { notifyBusinessNewBookingFull } from '@/lib/business-booking-notify';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

/**
 * Safe notification hooks — never throw; no-op with logs when providers are missing.
 */

export async function notifyBookingConfirmationQueued(params: {
  toEmail: string;
  toPhone?: string | null;
  guestName: string;
  whenIso: string;
  totalCents: number;
  depositCents: number;
  vehicles: string;
  appointmentId?: string;
}): Promise<void> {
  const whenLabel = new Date(params.whenIso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const admin = tryCreateAdminSupabase();
  const email = params.toEmail.trim().toLowerCase();
  try {
    if (email.includes('@') && resendConfigured()) {
      const html = bookingConfirmationEmailHtml({
        guestName: params.guestName,
        whenLabel,
        total: `$${(params.totalCents / 100).toFixed(2)}`,
        deposit: `$${(params.depositCents / 100).toFixed(2)}`,
        vehicles: params.vehicles,
        serviceAddress: '',
        remainingBalance: `$${(Math.max(0, params.totalCents - params.depositCents) / 100).toFixed(2)}`,
      });
      const sent = await sendResendHtml({ to: email, subject: 'Gloss Boss ATX — Booking confirmed', html });
      if (admin) {
        await admin.from('notification_outbox').insert({
          appointment_id: params.appointmentId ?? null,
          kind: 'booking_confirmation',
          channel: 'email',
          provider: 'resend',
          status: sent.ok ? 'sent' : 'failed',
          template_key: 'booking_confirmation',
          error_message: sent.ok ? null : sent.error ?? 'send failed',
          payload: { to: email },
          created_at: new Date().toISOString(),
        });
      }
    } else {
      await sendBookingConfirmationEmailIfConfigured({
        to: email,
        guestName: params.guestName,
        whenIso: params.whenIso,
        totalCents: params.totalCents,
        depositCents: params.depositCents,
        vehicles: params.vehicles,
      });
    }
  } catch (e) {
    console.warn('[notify] booking_confirmation email', e);
  }
  try {
    const phone = String(params.toPhone ?? '').trim();
    if (phone) {
      const admin = tryCreateAdminSupabase();
      await sendCustomerSms({
        db: admin,
        kind: 'booking_confirmation',
        template_key: 'booking_confirmation',
        to: phone,
        appointment_id: params.appointmentId ?? null,
        body: `Gloss Boss ATX: Booking confirmed for ${whenLabel}. ${params.vehicles.slice(0, 80)}. Deposit $${(params.depositCents / 100).toFixed(2)}. Total $${(params.totalCents / 100).toFixed(2)}.`,
        extraPayload: { guest_name: params.guestName, when_iso: params.whenIso },
      });
    }
  } catch (e) {
    console.warn('[notify] booking_confirmation SMS', e);
  }
}

export async function notifyJobStartedPlaceholder(
  customerPhone: string | null | undefined,
  apptId: string,
  opts?: {
    guestEmail?: string | null;
    guestName?: string | null;
    serviceLabel?: string;
    scheduledIso?: string;
    customerId?: string | null;
    technicianId?: string | null;
  },
): Promise<void> {
  const vehicleRef = apptId.slice(0, 8);
  try {
    const digits = String(customerPhone ?? '').replace(/\D/g, '');
    if (digits.length >= 10) {
      const admin = tryCreateAdminSupabase();
      await sendCustomerSms({
        db: admin,
        kind: 'job_started',
        template_key: 'job_started',
        to: digits,
        appointment_id: apptId,
        customer_id: opts?.customerId ?? null,
        technician_id: opts?.technicianId ?? null,
        body: `Gloss Boss ATX: Your detail has started (${opts?.serviceLabel ?? 'mobile detailing'}). Ref ${vehicleRef}. Track progress in your dashboard.`,
      });
    } else {
      console.info('[notify] job_started SMS skipped (no valid phone)', vehicleRef);
    }
  } catch (e) {
    console.warn('[notify] job_started SMS', e);
  }
  try {
    await sendJobStartedEmailIfConfigured({
      to: opts?.guestEmail,
      guestName: (opts?.guestName ?? 'there').trim() || 'there',
      serviceLabel: (opts?.serviceLabel ?? 'Mobile detailing').trim() || 'Mobile detailing',
      whenIso: opts?.scheduledIso ?? new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[notify] job_started email', e);
  }
}

export async function notifyJobCompletedPlaceholder(
  customerPhone: string | null | undefined,
  apptId: string,
  opts?: {
    guestEmail?: string | null;
    guestName?: string | null;
    serviceLabel?: string;
    customerId?: string | null;
    technicianId?: string | null;
  },
): Promise<void> {
  const vehicleRef = apptId.slice(0, 8);
  try {
    const digits = String(customerPhone ?? '').replace(/\D/g, '');
    if (digits.length >= 10) {
      const admin = tryCreateAdminSupabase();
      await sendCustomerSms({
        db: admin,
        kind: 'job_completed',
        template_key: 'job_completed',
        to: digits,
        appointment_id: apptId,
        customer_id: opts?.customerId ?? null,
        technician_id: opts?.technicianId ?? null,
        body: `Gloss Boss ATX: Your detail is complete. Thanks for choosing us — ref ${vehicleRef}. Photos may be in your dashboard.`,
      });
    } else {
      console.info('[notify] job_completed SMS skipped (no valid phone)', vehicleRef);
    }
  } catch (e) {
    console.warn('[notify] job_completed SMS', e);
  }
  try {
    await sendJobCompletedEmailIfConfigured({
      to: opts?.guestEmail,
      guestName: (opts?.guestName ?? 'there').trim() || 'there',
      serviceLabel: (opts?.serviceLabel ?? 'Mobile detailing').trim() || 'Mobile detailing',
    });
  } catch (e) {
    console.warn('[notify] job_completed email', e);
  }
}

export async function notifyBusinessNewBookingQueued(params: {
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
  try {
    await notifyBusinessNewBookingFull(params);
  } catch (e) {
    console.warn('[notify] business_booking', e);
  }
}

/** Placeholder: call with scheduled ISO when wiring a reminder cron or scheduled job. */
export async function notifyAppointmentReminderPlaceholder(toEmail: string, whenIso: string, _apptId: string): Promise<void> {
  try {
    await sendAppointmentReminderIfConfigured({ to: toEmail.trim().toLowerCase(), whenIso });
  } catch (e) {
    console.warn('[notify] appointment_reminder', e);
  }
}

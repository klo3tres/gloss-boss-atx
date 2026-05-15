import {
  sendAppointmentReminderIfConfigured,
  sendBookingConfirmationEmailIfConfigured,
  sendTwilioSms,
} from '@/lib/email-send';

/**
 * Safe notification hooks — never throw; no-op with logs when providers are missing.
 */

export async function notifyBookingConfirmationQueued(params: {
  toEmail: string;
  guestName: string;
  whenIso: string;
  totalCents: number;
  depositCents: number;
  vehicles: string;
}): Promise<void> {
  try {
    await sendBookingConfirmationEmailIfConfigured({
      to: params.toEmail.trim().toLowerCase(),
      guestName: params.guestName,
      whenIso: params.whenIso,
      totalCents: params.totalCents,
      depositCents: params.depositCents,
      vehicles: params.vehicles,
    });
  } catch (e) {
    console.warn('[notify] booking_confirmation', e);
  }
}

export async function notifyJobStartedPlaceholder(customerPhone: string | null | undefined, apptId: string): Promise<void> {
  try {
    const digits = String(customerPhone ?? '').replace(/\D/g, '');
    if (digits.length < 10) {
      console.info('[notify] job_started skipped (no valid phone)', apptId.slice(0, 8));
      return;
    }
    await sendTwilioSms({
      to: digits,
      body: `Gloss Boss ATX: Your detail has started. Reference ${apptId.slice(0, 8)}… We’ll update you when it wraps.`,
    });
  } catch (e) {
    console.warn('[notify] job_started', e);
  }
}

export async function notifyJobCompletedPlaceholder(customerPhone: string | null | undefined, apptId: string): Promise<void> {
  try {
    const digits = String(customerPhone ?? '').replace(/\D/g, '');
    if (digits.length < 10) {
      console.info('[notify] job_completed skipped (no valid phone)', apptId.slice(0, 8));
      return;
    }
    await sendTwilioSms({
      to: digits,
      body: `Gloss Boss ATX: Your detail is complete. Thanks for choosing us — reference ${apptId.slice(0, 8)}… Photos may be available in your dashboard.`,
    });
  } catch (e) {
    console.warn('[notify] job_completed', e);
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

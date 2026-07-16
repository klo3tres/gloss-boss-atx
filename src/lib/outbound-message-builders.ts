function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
}

export function whenChicago(iso: string) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export type JobNotificationKind =
  | 'technician_on_the_way'
  | 'technician_arrived'
  | 'running_late'
  | 'job_started'
  | 'work_started'
  | 'halfway_complete'
  | 'last_touches'
  | 'payment_link'
  | 'zelle_instructions'
  | 'review_request'
  | 'job_completed'
  | 'technician_assigned'
  | 'appointment_reminder'
  | 'appointment_confirmed'
  | 'booking_confirmation';

export function buildJobNotificationSms(
  kind: string,
  ctx: {
    vehicle: string;
    dashboardUrl: string;
    reviewUrl: string;
    paymentUrl?: string | null;
    zelleContact?: string | null;
    balanceLabel?: string | null;
  },
): string {
  const { vehicle, dashboardUrl, reviewUrl, paymentUrl, zelleContact, balanceLabel } = ctx;
  switch (kind) {
    case 'technician_on_the_way':
      return `Gloss Boss ATX update: Your technician is on the way for ${vehicle}. Track updates here: ${dashboardUrl}`;
    case 'technician_arrived':
      return `Gloss Boss ATX update: Your technician has arrived for ${vehicle}. Track updates here: ${dashboardUrl}`;
    case 'running_late':
      return `Gloss Boss ATX update: We are running behind schedule for ${vehicle}. We will keep your ETA updated here: ${dashboardUrl}`;
    case 'halfway_complete':
      return `Gloss Boss ATX update: We are about halfway through ${vehicle}. Track updates here: ${dashboardUrl}`;
    case 'last_touches':
      return `Gloss Boss ATX update: We are doing the last touches on ${vehicle}. Track updates here: ${dashboardUrl}`;
    case 'payment_link':
      return paymentUrl
        ? `Gloss Boss ATX: Your balance${balanceLabel ? ` of ${balanceLabel}` : ''} for ${vehicle} is ready. Pay securely here: ${paymentUrl}`
        : `Gloss Boss ATX: Your balance for ${vehicle} is ready. View details: ${dashboardUrl}`;
    case 'zelle_instructions':
      return zelleContact
        ? `Gloss Boss ATX: Your balance${balanceLabel ? ` is ${balanceLabel}` : ''}. You can Zelle ${zelleContact}. Please include your name.`
        : `Gloss Boss ATX: Your balance for ${vehicle} can be paid by Zelle. Contact us for payment details.`;
    case 'job_started':
    case 'work_started':
      return `Gloss Boss ATX update: Work has started on ${vehicle}. Track live progress here: ${dashboardUrl}`;
    case 'job_completed':
      return `Gloss Boss ATX update: Your detail is complete for ${vehicle}. Photos and receipt are available here: ${dashboardUrl}`;
    case 'technician_assigned':
      return `Gloss Boss ATX update: Your technician has been assigned for ${vehicle}. Track your appointment here: ${dashboardUrl}`;
    case 'appointment_reminder':
      return `Gloss Boss ATX reminder: Your appointment for ${vehicle} is coming up. Details: ${dashboardUrl}`;
    case 'appointment_confirmed':
    case 'booking_confirmation':
      return `Gloss Boss ATX: Your appointment for ${vehicle} is confirmed. Details: ${dashboardUrl}`;
    case 'review_request':
      return `Gloss Boss ATX update: Thanks for choosing Gloss Boss ATX. Review your completed service here: ${reviewUrl}`;
    default:
      return `Gloss Boss ATX update: Thanks for choosing Gloss Boss ATX. Track your service here: ${dashboardUrl}`;
  }
}

export function buildJobNotificationEmailSubject(kind: string): string {
  switch (kind) {
    case 'payment_link':
      return 'Gloss Boss ATX — Payment link';
    case 'zelle_instructions':
      return 'Gloss Boss ATX — Zelle payment instructions';
    case 'technician_on_the_way':
      return 'Gloss Boss ATX — Technician on the way';
    case 'technician_arrived':
      return 'Gloss Boss ATX — Technician arrived';
    case 'running_late':
      return 'Gloss Boss ATX — Updated arrival time';
    case 'halfway_complete':
      return 'Gloss Boss ATX — Service update';
    case 'last_touches':
      return 'Gloss Boss ATX — Last touches';
    case 'job_started':
    case 'work_started':
      return 'Gloss Boss ATX — Service started';
    case 'job_completed':
      return 'Gloss Boss ATX — Service complete';
    case 'review_request':
      return 'Gloss Boss ATX — How did we do?';
    case 'appointment_confirmed':
    case 'booking_confirmation':
      return 'Gloss Boss ATX — Booking confirmed';
    default:
      return 'Gloss Boss ATX — Update';
  }
}

export function buildRescheduleEmailBody(input: {
  guestName: string;
  oldStart: string;
  newStart: string;
  confirmUrl: string;
  calUrl?: string;
}): string {
  const cal = input.calUrl ? `\nAdd to calendar: ${input.calUrl}` : '';
  return `Hi ${input.guestName},

Your appointment has been rescheduled.

Was: ${whenChicago(input.oldStart)}
Now: ${whenChicago(input.newStart)}

View confirmation: ${input.confirmUrl}${cal}`;
}

export function buildRescheduleSmsBody(input: {
  oldStart: string;
  newStart: string;
  confirmUrl: string;
}): string {
  return `Gloss Boss ATX: Your appointment moved from ${whenChicago(input.oldStart)} to ${whenChicago(input.newStart)}. Details: ${input.confirmUrl}`;
}

export function buildWorkOrderTimeChangeEmailBody(input: {
  guestName: string;
  oldStart: string;
  newStart: string;
  confirmUrl: string;
}): string {
  return `Hi ${input.guestName},

Your appointment time was updated.

Was: ${whenChicago(input.oldStart)}
Now: ${whenChicago(input.newStart)}

View confirmation: ${input.confirmUrl}`;
}

export function buildWorkOrderTimeChangeSmsBody(input: {
  oldStart: string;
  newStart: string;
  confirmUrl: string;
}): string {
  return `Gloss Boss ATX: Appointment time updated to ${whenChicago(input.newStart)} (was ${whenChicago(input.oldStart)}). ${input.confirmUrl}`;
}

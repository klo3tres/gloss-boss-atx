import {
  emailCard,
  emailParagraph,
  escapeEmailHtml,
  glossBossEmailLayout,
  portalButtonHtml,
} from '@/lib/email/templates/layout';

export function bookingConfirmationEmailHtml(details: {
  guestName: string;
  whenLabel: string;
  total: string;
  deposit: string;
  vehicles: string;
  serviceAddress?: string;
  remainingBalance?: string;
  calendarUrl?: string;
  confirmationUrl?: string;
}): string {
  const card = emailCard(`
    <p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#d4af37;">Appointment</p>
    <p style="margin:0;font-size:16px;font-weight:700;color:#fafafa;">${escapeEmailHtml(details.whenLabel)}</p>
    <p style="margin:12px 0 0;font-size:13px;color:#a1a1aa;">${escapeEmailHtml(details.vehicles)}</p>
    ${details.serviceAddress ? `<p style="margin:10px 0 0;font-size:13px;color:#a1a1aa;">Service address: ${escapeEmailHtml(details.serviceAddress)}</p>` : ''}
    <p style="margin:14px 0 0;font-size:14px;color:#fafafa;">Job total <strong style="color:#fefce8;">${escapeEmailHtml(details.total)}</strong></p>
    <p style="margin:8px 0 0;font-size:14px;color:#fcd34d;">Deposit paid <strong>${escapeEmailHtml(details.deposit)}</strong></p>
    ${details.remainingBalance ? `<p style="margin:8px 0 0;font-size:14px;color:#fafafa;">Remaining balance <strong>${escapeEmailHtml(details.remainingBalance)}</strong></p>` : ''}
  `);

  const bodyHtml =
    emailParagraph(`Hi ${escapeEmailHtml(details.guestName)},`, false) +
    emailParagraph('Your booking is confirmed. We look forward to delivering a flawless finish.', true) +
    card +
    emailParagraph('You will complete the service acknowledgement when prompted before your appointment.', true) +
    (details.calendarUrl
      ? `<p style="margin:16px 0 0;font-size:14px;"><a href="${details.calendarUrl}" style="color:#fcd34d;font-weight:700;">Add to calendar (.ics)</a></p>`
      : '') +
    (details.confirmationUrl
      ? `<p style="margin:8px 0 0;font-size:14px;"><a href="${details.confirmationUrl}" style="color:#d4af37;">View booking confirmation</a></p>`
      : '') +
    portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? 'https://glossbossatx.com');

  return glossBossEmailLayout({
    title: 'Booking confirmation',
    preview: 'Your Gloss Boss ATX appointment is confirmed',
    headline: 'Booking confirmed',
    bodyHtml,
  });
}

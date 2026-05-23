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
}): string {
  const card = emailCard(`
    <p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#d4af37;">Appointment</p>
    <p style="margin:0;font-size:16px;font-weight:700;color:#fafafa;">${escapeEmailHtml(details.whenLabel)}</p>
    <p style="margin:12px 0 0;font-size:13px;color:#a1a1aa;">${escapeEmailHtml(details.vehicles)}</p>
    <p style="margin:14px 0 0;font-size:14px;color:#fafafa;">Estimated total <strong style="color:#fefce8;">${escapeEmailHtml(details.total)}</strong></p>
    <p style="margin:8px 0 0;font-size:14px;color:#fcd34d;">Deposit due <strong>${escapeEmailHtml(details.deposit)}</strong></p>
  `);

  const bodyHtml =
    emailParagraph(`Hi ${escapeEmailHtml(details.guestName)},`, false) +
    emailParagraph('Your booking is confirmed. We look forward to delivering a flawless finish.', true) +
    card +
    emailParagraph('You will complete the service acknowledgement when prompted before your appointment.', true) +
    portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? 'https://glossbossatx.com');

  return glossBossEmailLayout({
    title: 'Booking confirmation',
    preview: 'Your Gloss Boss ATX appointment is confirmed',
    headline: 'Booking confirmed',
    bodyHtml,
  });
}

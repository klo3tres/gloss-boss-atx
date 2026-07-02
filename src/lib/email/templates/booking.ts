import { emailCard,
  emailParagraph,
  escapeEmailHtml,
  glossBossEmailLayout,
  portalButtonHtml,
  emailCtaButton,
} from '@/lib/email/templates/layout';
export function bookingConfirmationEmailHtml(details: {
  guestName: string;
  whenLabel: string;
  service?: string;
  total: string;
  deposit: string;
  vehicles: string;
  serviceAddress?: string;
  remainingBalance?: string;
  duration?: string;
  calendarUrl?: string;
  confirmationUrl?: string;
  portalUrl?: string;
}): string {
  const bizPhone = process.env.BUSINESS_PHONE?.trim() || '(512) 555-0100';
  const bizEmail = process.env.BUSINESS_EMAIL?.trim() || 'hello@glossbossatx.com';

  const card = emailCard(`
    <p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#d4af37;">Appointment confirmed</p>
    <p style="margin:0;font-size:16px;font-weight:700;color:#fafafa;">${escapeEmailHtml(details.whenLabel)}</p>
    ${details.service ? `<p style="margin:10px 0 0;font-size:13px;color:#fcd34d;font-weight:700;">${escapeEmailHtml(details.service)}</p>` : ''}
    <p style="margin:12px 0 0;font-size:13px;color:#a1a1aa;">${escapeEmailHtml(details.vehicles)}</p>
    ${details.duration ? `<p style="margin:8px 0 0;font-size:13px;color:#a1a1aa;">Estimated duration: ${escapeEmailHtml(details.duration)}</p>` : ''}
    ${details.serviceAddress ? `<p style="margin:10px 0 0;font-size:13px;color:#a1a1aa;">Service address: ${escapeEmailHtml(details.serviceAddress)}</p>` : ''}
    <p style="margin:14px 0 0;font-size:14px;color:#fafafa;">Job total <strong style="color:#fefce8;">${escapeEmailHtml(details.total)}</strong></p>
    <p style="margin:8px 0 0;font-size:14px;color:#fcd34d;">Deposit <strong>${escapeEmailHtml(details.deposit)}</strong></p>
    ${details.remainingBalance ? `<p style="margin:8px 0 0;font-size:14px;color:#fafafa;">Remaining balance <strong>${escapeEmailHtml(details.remainingBalance)}</strong></p>` : ''}
  `);

  const prep = emailCard(`
    <p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#d4af37;">Before we arrive</p>
    <ul style="margin:0;padding-left:18px;font-size:13px;color:#a1a1aa;line-height:1.7;">
      <li>Clear vehicle access and parking near a water source if required</li>
      <li>Remove personal items from the vehicle</li>
      <li>Ensure power outlet access if needed for equipment</li>
      <li>Need to reschedule? Reply to this email or call ${escapeEmailHtml(bizPhone)}</li>
    </ul>
  `);

  const bodyHtml =
    emailParagraph(`Hi ${escapeEmailHtml(details.guestName)},`, false) +
    emailParagraph(
      'Your Gloss Boss appointment is confirmed. You can view your appointment, updates, photos, loyalty rewards, and referral link in your secure customer portal.',
      true,
    ) +
    card +
    prep +
    emailParagraph(`Questions? ${escapeEmailHtml(bizEmail)} · ${escapeEmailHtml(bizPhone)}`, true) +
    (details.portalUrl
      ? emailCtaButton(details.portalUrl, 'View my appointment')
      : portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? 'https://glossbossatx.com')) +
    (details.calendarUrl
      ? `<p style="margin:16px 0 0;font-size:14px;text-align:center;"><a href="${details.calendarUrl}" style="color:#fcd34d;font-weight:700;">Add to calendar (.ics)</a></p>`
      : '') +
    (details.confirmationUrl
      ? `<p style="margin:8px 0 0;font-size:13px;text-align:center;"><a href="${details.confirmationUrl}" style="color:#a1a1aa;">View booking receipt</a></p>`
      : '');

  return glossBossEmailLayout({
    title: 'Booking confirmation',
    preview: 'Your Gloss Boss ATX appointment is confirmed',
    headline: 'Booking confirmed',
    bodyHtml,
  });
}

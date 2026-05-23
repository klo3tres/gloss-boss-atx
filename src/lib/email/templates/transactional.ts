import {
  emailCard,
  emailCtaButton,
  emailParagraph,
  escapeEmailHtml,
  glossBossEmailLayout,
  portalButtonHtml,
} from '@/lib/email/templates/layout';

export function paymentReceivedEmailHtml(params: {
  guestName: string;
  whenLabel: string;
  paid: string;
  total: string;
  kindLabel: string;
}): string {
  const bodyHtml =
    emailParagraph(`Hi ${escapeEmailHtml(params.guestName)},`, false) +
    emailParagraph(`Thank you — your ${escapeEmailHtml(params.kindLabel.toLowerCase())} was processed successfully.`, true) +
    emailCard(`
      <p style="margin:0;font-size:14px;color:#fafafa;">Appointment: <strong>${escapeEmailHtml(params.whenLabel)}</strong></p>
      <p style="margin:12px 0 0;font-size:15px;color:#fcd34d;">Paid: <strong>${escapeEmailHtml(params.paid)}</strong></p>
      <p style="margin:8px 0 0;font-size:13px;color:#a1a1aa;">Package total (estimate): ${escapeEmailHtml(params.total)}</p>
    `) +
    portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? 'https://glossbossatx.com');

  return glossBossEmailLayout({
    title: 'Payment confirmation',
    preview: 'Payment received — Gloss Boss ATX',
    headline: params.kindLabel,
    bodyHtml,
  });
}

export function welcomeEmailHtml(params: { name: string }): string {
  const bodyHtml =
    emailParagraph(`Hi ${escapeEmailHtml(params.name)},`, false) +
    emailParagraph('Your customer account is ready. Book services, pay deposits, complete intake, and track job progress from your dashboard.', true) +
    portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? 'https://glossbossatx.com');

  return glossBossEmailLayout({
    title: 'Welcome to Gloss Boss ATX',
    preview: 'Your Gloss Boss ATX account is ready',
    headline: 'Welcome aboard',
    bodyHtml,
  });
}

export function jobStartedEmailHtml(params: { guestName: string; serviceLabel: string; whenLabel: string }): string {
  const bodyHtml =
    emailParagraph(`Hi ${escapeEmailHtml(params.guestName)},`, false) +
    emailParagraph('Your service has <strong style="color:#fcd34d;">started</strong>. Our team is on site and working on your vehicle.', true) +
    emailCard(`
      <p style="margin:0;font-size:14px;color:#fafafa;"><strong>Service:</strong> ${escapeEmailHtml(params.serviceLabel)}</p>
      <p style="margin:10px 0 0;font-size:13px;color:#a1a1aa;">Scheduled: ${escapeEmailHtml(params.whenLabel)}</p>
    `) +
    portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? 'https://glossbossatx.com');

  return glossBossEmailLayout({
    title: 'Service in progress',
    preview: 'Your Gloss Boss ATX detail has started',
    headline: 'Service started',
    bodyHtml,
  });
}

export function jobCompletedEmailHtml(params: { guestName: string; serviceLabel: string }): string {
  const bodyHtml =
    emailParagraph(`Hi ${escapeEmailHtml(params.guestName)},`, false) +
    emailParagraph('Your detail is <strong style="color:#6ee7b7;">complete</strong>. Thank you for trusting Gloss Boss ATX with your vehicle.', true) +
    emailCard(`<p style="margin:0;font-size:14px;color:#fafafa;"><strong>Service:</strong> ${escapeEmailHtml(params.serviceLabel)}</p>`) +
    portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? 'https://glossbossatx.com');

  return glossBossEmailLayout({
    title: 'Service complete',
    preview: 'Your Gloss Boss ATX service is complete',
    headline: 'Service complete',
    bodyHtml,
  });
}

export function paymentLinkEmailHtml(params: { guestName: string; vehicle: string; paymentUrl: string }): string {
  const bodyHtml =
    emailParagraph(`Hi ${escapeEmailHtml(params.guestName)},`, false) +
    emailParagraph(`Your secure payment link for <strong style="color:#fafafa;">${escapeEmailHtml(params.vehicle)}</strong> is ready.`, true) +
    emailCtaButton(params.paymentUrl, 'Pay now');

  return glossBossEmailLayout({
    title: 'Payment link',
    preview: 'Complete your Gloss Boss ATX payment',
    headline: 'Pay now',
    bodyHtml,
  });
}

export function reviewRequestEmailHtml(params: { guestName: string; vehicle: string; reviewUrl: string }): string {
  const bodyHtml =
    emailParagraph(`Hi ${escapeEmailHtml(params.guestName)},`, false) +
    emailParagraph(`Thank you for trusting us with <strong style="color:#fafafa;">${escapeEmailHtml(params.vehicle)}</strong>. A quick Google review helps other Austin drivers find premium mobile detailing.`, true) +
    `<p style="margin:16px 0;text-align:center;font-size:28px;color:#d4af37;letter-spacing:4px;">★★★★★</p>` +
    emailCtaButton(params.reviewUrl, 'Leave Google review');

  return glossBossEmailLayout({
    title: 'How did we do?',
    preview: 'Share your Gloss Boss ATX experience',
    headline: 'Leave a review',
    bodyHtml,
  });
}

export function appointmentReminderEmailHtml(params: { whenLabel: string }): string {
  const bodyHtml =
    emailParagraph('This is a friendly reminder from Gloss Boss ATX.', true) +
    emailParagraph(`You have scheduled service on <strong style="color:#fcd34d;">${escapeEmailHtml(params.whenLabel)}</strong>.`, true) +
    portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? 'https://glossbossatx.com');

  return glossBossEmailLayout({
    title: 'Appointment reminder',
    preview: 'Upcoming Gloss Boss ATX appointment',
    headline: 'Appointment reminder',
    bodyHtml,
  });
}

export function notifyKindEmailHtml(params: {
  kind: string;
  guestName: string;
  vehicle: string;
  message: string;
  ctaHref?: string;
  ctaLabel?: string;
}): string {
  const headlines: Record<string, string> = {
    last_touches: 'Last touches',
    job_started: 'Service started',
    work_started: 'Service started',
    job_completed: 'Service complete',
    technician_assigned: 'Technician assigned',
    appointment_reminder: 'Appointment reminder',
    appointment_confirmed: 'Booking confirmed',
    booking_confirmation: 'Booking confirmed',
    payment_link: 'Pay now',
    review_request: 'Leave a review',
  };
  const headline = headlines[params.kind] ?? 'Update from Gloss Boss ATX';
  let body =
    emailParagraph(`Hi ${escapeEmailHtml(params.guestName || 'there')},`, false) +
    emailParagraph(escapeEmailHtml(params.message), true);
  if (params.ctaHref && params.ctaLabel) {
    body += emailCtaButton(params.ctaHref, params.ctaLabel);
  } else {
    body += portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? 'https://glossbossatx.com');
  }

  return glossBossEmailLayout({
    title: headline,
    preview: `${headline} — Gloss Boss ATX`,
    headline,
    bodyHtml: body,
  });
}

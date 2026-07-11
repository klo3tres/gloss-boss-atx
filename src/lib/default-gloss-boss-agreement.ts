/** Plain-text default acknowledgement — never raw CMS/JSX. Used when no `agreement_templates` row is active. */

export const DEFAULT_AGREEMENT_TITLE = 'Gloss Boss ATX — Service Acknowledgement & Liability';

export type NativeAgreementContext = {
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  vehicleDescription: string;
  serviceLabel: string;
  vehicleClassLabel: string;
  /** Total job value in dollars string e.g. "249.00" */
  totalDollars: string;
  depositNote: string;
  technicianName?: string | null;
  shopLegalName?: string;
};

function line(s: string): string {
  return s.trim();
}

/**
 * Builds the full agreement body stored in `signed_agreements.agreement_snapshot` (plain text).
 * Section headings are stable for UI parsing and immutability of signed snapshots.
 */
export function buildNativeAgreementSnapshot(ctx: NativeAgreementContext): string {
  const shop = ctx.shopLegalName?.trim() || 'Gloss Boss ATX';
  const tech = ctx.technicianName?.trim() || 'Assigned technician';
  const email = ctx.customerEmail?.trim() || '—';
  const phone = ctx.customerPhone?.trim() || '—';

  const sections = [
    line(`${DEFAULT_AGREEMENT_TITLE}`),
    '',
    line(`Shop: ${shop}`),
    line(`Technician / witness: ${tech}`),
    line(`Generated: ${new Date().toISOString()}`),
    '',
    '--- CUSTOMER INFORMATION ---',
    line(`Legal name: ${ctx.customerName}`),
    line(`Email: ${email}`),
    line(`Phone: ${phone}`),
    '',
    '--- VEHICLE ---',
    line(ctx.vehicleDescription || 'As described at booking.'),
    line(`Vehicle class: ${ctx.vehicleClassLabel}`),
    '',
    '--- SERVICE AUTHORIZATION ---',
    line(`Package / services: ${ctx.serviceLabel}`),
    'Customer authorizes Gloss Boss ATX and its technicians to perform the booked mobile detailing services on the vehicle described above at the scheduled service location.',
    '',
    '--- VEHICLE CONDITION ---',
    'Customer acknowledges that pre-existing paint damage, dents, scratches, oxidation, swirl marks, clear coat failure, or other conditions not caused during this service are not the responsibility of Gloss Boss ATX. Results depend on starting condition and product limitations.',
    '',
    '--- ACCESS ---',
    'Customer will provide safe, lawful access to the vehicle and service area (including parking, gate codes, and water/power access as arranged). Gloss Boss ATX may pause or reschedule if access is unsafe or unavailable.',
    '',
    '--- BELONGINGS ---',
    'Customer is responsible for removing valuables and personal items from the vehicle before service. Gloss Boss ATX is not liable for loss of items left in the vehicle.',
    '',
    '--- PAYMENT ---',
    line(ctx.depositNote),
    line(`Total (quoted / agreed for this job): $${ctx.totalDollars}`),
    'Remaining balance is due as arranged at booking or on completion unless otherwise agreed in writing.',
    '',
    '--- CANCELLATION ---',
    'Late cancellations or no-shows may forfeit deposit or incur a reschedule fee as stated in shop policy communicated at booking.',
    '',
    '--- RESULTS & LIMITATIONS ---',
    'Detailing improves appearance and protection within practical limits. Gloss Boss ATX does not guarantee removal of all defects, permanent stain removal, or restoration of severely oxidized or damaged surfaces. Liability for any claim arising from mobile detailing services is limited to the amount paid for the specific service session, except where prohibited by law.',
    '',
    '--- OPERATIONAL PHOTOS (REQUIRED) ---',
    'Gloss Boss ATX captures before/after and documentation photographs of the vehicle for quality control, insurance, and job records. These operational photos are required for service documentation and are not the same as optional marketing use.',
    '',
    '--- OPTIONAL MARKETING MEDIA ---',
    'Separately, customer may opt in to allow Gloss Boss ATX to use vehicle photos or short video clips for marketing, social media, or portfolio purposes. Declining optional marketing media does not affect service authorization or the ability to sign this acknowledgement. Sensitive areas will not be published without consent.',
    '',
    '--- SMS / TEXT MESSAGES (OPTIONAL) ---',
    'Customer may optionally consent to receive SMS/text messages from Gloss Boss ATX about appointments, service updates, and promotions. Message frequency varies. Message and data rates may apply. Reply STOP to opt out. Declining SMS marketing does not prevent signing this acknowledgement or receiving essential transactional service messages where permitted by law.',
    '',
    '--- ELECTRONIC SIGNATURE ---',
    'By typing their full legal name and providing a typed or drawn signature below, the customer agrees to the terms above and acknowledges receipt of this service acknowledgement. The electronic signature is intended to have the same force and effect as a handwritten signature.',
  ];

  return sections.join('\n');
}

/** Parse `--- HEADING ---` sections from a plain-text agreement snapshot for readable UI. */
export function parseAgreementSnapshotSections(
  body: string,
): Array<{ heading: string; content: string }> {
  const text = body.trim();
  if (!text) return [];
  const parts = text.split(/\n(?=---\s+.+\s+---\s*$)/m);
  const sections: Array<{ heading: string; content: string }> = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^---\s*(.+?)\s*---\s*\n?([\s\S]*)$/);
    if (match) {
      sections.push({
        heading: match[1].trim(),
        content: match[2].trim(),
      });
    } else if (sections.length === 0) {
      sections.push({ heading: 'Overview', content: trimmed });
    } else {
      const last = sections[sections.length - 1];
      last.content = `${last.content}\n\n${trimmed}`.trim();
    }
  }
  return sections;
}

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
    '',
    '--- SERVICE ---',
    line(`Package: ${ctx.serviceLabel}`),
    line(`Vehicle class: ${ctx.vehicleClassLabel}`),
    '',
    '--- PRE-EXISTING DAMAGE ---',
    'Customer acknowledges that pre-existing paint damage, dents, scratches, oxidation, or clear coat failure not caused during this service are not the responsibility of Gloss Boss ATX.',
    '',
    '--- PERSONAL ITEMS ---',
    'Customer is responsible for removing valuables and personal items from the vehicle before service. Gloss Boss ATX is not liable for loss of items left in the vehicle.',
    '',
    '--- LIABILITY LIMITATION ---',
    'To the fullest extent permitted by law, Gloss Boss ATX liability for any claim arising from mobile detailing services is limited to the amount paid for the specific service session, except where prohibited by law.',
    '',
    '--- PAYMENT & DEPOSIT ---',
    line(ctx.depositNote),
    line(`Total (quoted / agreed for this job): $${ctx.totalDollars}`),
    '',
    '--- CANCELLATION ---',
    'Late cancellations or no-shows may forfeit deposit or incur a reschedule fee as stated in shop policy communicated at booking.',
    '',
    '--- PHOTO & MEDIA AUTHORIZATION ---',
    'Customer authorizes Gloss Boss ATX to capture before/after photographs of the vehicle for quality documentation, insurance, and marketing where permitted. Sensitive areas will not be published without separate written consent.',
    '',
    '--- ELECTRONIC SIGNATURE ---',
    'By typing their full legal name below, the customer agrees to the terms above and acknowledges receipt of this acknowledgement.',
  ];

  return sections.join('\n');
}

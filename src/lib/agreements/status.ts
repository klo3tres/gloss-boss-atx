/**
 * Agreement status model + display helpers.
 */

export type AgreementStatus =
  | 'not_created'
  | 'not_sent'
  | 'scheduled'
  | 'sent'
  | 'delivered'
  | 'viewed'
  | 'signed'
  | 'verbal'
  | 'declined_optional_media'
  | 'failed_delivery'
  | 'expired'
  | 'voided'
  | 'requires_resign';

export type AgreementBadgeTone = 'danger' | 'warning' | 'success' | 'neutral' | 'info';

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  not_created: 'Not created',
  not_sent: 'Not sent',
  scheduled: 'Scheduled',
  sent: 'Sent',
  delivered: 'Delivered',
  viewed: 'Viewed',
  signed: 'Signed',
  verbal: 'Verbal acknowledgment recorded',
  declined_optional_media: 'Declined optional media',
  failed_delivery: 'Failed delivery',
  expired: 'Expired',
  voided: 'Voided',
  requires_resign: 'Requires re-signature',
};

export function agreementBadgeTone(status: AgreementStatus): AgreementBadgeTone {
  switch (status) {
    case 'signed':
      return 'success';
    case 'verbal':
      return 'neutral';
    case 'sent':
    case 'delivered':
    case 'viewed':
    case 'scheduled':
    case 'declined_optional_media':
      return 'warning';
    case 'failed_delivery':
    case 'expired':
    case 'voided':
    case 'requires_resign':
    case 'not_sent':
    case 'not_created':
      return 'danger';
    default:
      return 'info';
  }
}

export function isAgreementComplete(status: AgreementStatus | null | undefined): boolean {
  return status === 'signed' || status === 'verbal';
}

export function parseAgreementStatus(raw: unknown): AgreementStatus {
  const s = String(raw ?? '').trim();
  if ((Object.keys(AGREEMENT_STATUS_LABELS) as AgreementStatus[]).includes(s as AgreementStatus)) {
    return s as AgreementStatus;
  }
  return 'not_created';
}

export function resolveDisplayStatus(input: {
  requestStatus?: string | null;
  signed?: boolean;
  verbal?: boolean;
  viewedAt?: string | null;
  sentAt?: string | null;
  failed?: boolean;
}): AgreementStatus {
  if (input.verbal) return 'verbal';
  if (input.signed) return 'signed';
  if (input.requestStatus) {
    const parsed = parseAgreementStatus(input.requestStatus);
    if (parsed !== 'not_created') return parsed;
  }
  if (input.failed) return 'failed_delivery';
  if (input.viewedAt) return 'viewed';
  if (input.sentAt) return 'sent';
  return 'not_sent';
}

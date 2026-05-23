export type TwilioDeliveryInfo = {
  rawStatus: string;
  label: string;
  isDelivered: boolean;
  isFailure: boolean;
  needsTollFreeWarning: boolean;
  detail: string;
};

export function describeTwilioDelivery(
  status: string | undefined | null,
  opts?: { errorCode?: string | null; errorMessage?: string | null; sid?: string | null },
): TwilioDeliveryInfo {
  const raw = String(status ?? 'unknown').toLowerCase();
  const err = opts?.errorMessage?.trim();
  const code = opts?.errorCode != null && opts.errorCode !== '' ? String(opts.errorCode) : null;

  let label: string;
  let needsTollFreeWarning = false;

  switch (raw) {
    case 'delivered':
      label = 'Delivered';
      break;
    case 'sent':
      label = 'Sent (carrier confirmed send)';
      break;
    case 'queued':
    case 'sending':
      label = 'Queued';
      break;
    case 'accepted':
      label = 'Accepted by Twilio, delivery not confirmed';
      needsTollFreeWarning = true;
      break;
    case 'failed':
    case 'undelivered':
      label = err ? `Failed: ${err}` : 'Failed / undelivered';
      break;
    default:
      label = raw === 'unknown' ? 'Status unknown' : raw.replace(/_/g, ' ');
      if (raw === 'accepted' || raw === 'queued') needsTollFreeWarning = true;
  }

  const isDelivered = raw === 'delivered' || raw === 'sent';
  const isFailure = raw === 'failed' || raw === 'undelivered';

  const parts = [
    `status=${raw}`,
    opts?.sid ? `sid=${opts.sid}` : null,
    code ? `error_code=${code}` : null,
    err ? `carrier=${err}` : null,
    needsTollFreeWarning
      ? 'Twilio accepted the SMS but carrier delivery may be blocked until toll-free verification is complete.'
      : null,
  ].filter(Boolean);

  return {
    rawStatus: raw,
    label,
    isDelivered,
    isFailure,
    needsTollFreeWarning,
    detail: parts.join(' · '),
  };
}

export function integrationTestStatusFromDelivery(info: TwilioDeliveryInfo): string {
  if (info.isFailure) return 'failed';
  if (info.isDelivered) return 'delivered';
  if (info.rawStatus === 'queued' || info.rawStatus === 'sending') return 'queued';
  if (info.rawStatus === 'accepted') return 'accepted';
  return info.rawStatus;
}

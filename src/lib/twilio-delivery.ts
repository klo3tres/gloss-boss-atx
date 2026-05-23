export type TwilioDeliveryInfo = {
  rawStatus: string;
  label: string;
  isDelivered: boolean;
  isFailure: boolean;
  needsTollFreeWarning: boolean;
  detail: string;
};

const TOLL_FREE_VERIFY_MSG =
  'Toll-free verification required. Twilio accepted the request, but carriers blocked delivery until the toll-free number is verified. Complete Twilio Toll-Free Verification for +18664853974.';

export function describeTwilioDelivery(
  status: string | undefined | null,
  opts?: { errorCode?: string | null; errorMessage?: string | null; sid?: string | null },
): TwilioDeliveryInfo {
  const raw = String(status ?? 'unknown').toLowerCase();
  const err = opts?.errorMessage?.trim();
  const code = opts?.errorCode != null && opts.errorCode !== '' ? String(opts.errorCode) : null;
  const is30032 = code === '30032' || /30032|toll.?free|unverified/i.test(err ?? '');

  let label: string;
  let needsTollFreeWarning = false;

  if (is30032 || (raw === 'undelivered' && /toll|30032|unverified/i.test(err ?? ''))) {
    return {
      rawStatus: raw,
      label: TOLL_FREE_VERIFY_MSG,
      isDelivered: false,
      isFailure: true,
      needsTollFreeWarning: true,
      detail: [`error_code=${code ?? '30032'}`, err ? `carrier=${err}` : null, TOLL_FREE_VERIFY_MSG, opts?.sid ? `sid=${opts.sid}` : null]
        .filter(Boolean)
        .join(' · '),
    };
  }

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

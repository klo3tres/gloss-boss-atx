'use client';

import {
  AGREEMENT_STATUS_LABELS,
  agreementBadgeTone,
  parseAgreementStatus,
  type AgreementBadgeTone,
  type AgreementStatus,
} from '@/lib/agreements/status';

const TONE_CLASS: Record<AgreementBadgeTone, string> = {
  success: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-500/35 bg-amber-500/10 text-amber-100',
  danger: 'border-rose-500/35 bg-rose-500/10 text-rose-200',
  neutral: 'border-white/15 bg-white/[0.04] text-zinc-300',
  info: 'border-sky-500/35 bg-sky-500/10 text-sky-200',
};

export function AgreementStatusBadge({
  status,
  label,
  className = '',
}: {
  status?: string | null;
  label?: string;
  className?: string;
}) {
  const parsed: AgreementStatus = parseAgreementStatus(status);
  const tone = agreementBadgeTone(parsed);
  const text = label ?? AGREEMENT_STATUS_LABELS[parsed];

  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${TONE_CLASS[tone]} ${className}`}
    >
      {text}
    </span>
  );
}

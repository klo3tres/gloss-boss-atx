'use client';

import Link from 'next/link';

export function ReceiptSendForm({
  receiptId,
  paymentId,
  workOrderId,
}: {
  receiptId?: string;
  paymentId?: string;
  workOrderId?: string;
}) {
  const href = workOrderId
    ? `/admin/work-orders/${encodeURIComponent(workOrderId)}?shell=admin#wo-receipt`
    : receiptId
      ? `/admin/receipts/${encodeURIComponent(receiptId)}`
      : paymentId
        ? `/admin/receipts/${encodeURIComponent(paymentId)}`
        : null;

  if (!href) {
    return (
      <span className='rounded-xl border border-white/10 px-4 py-2 text-xs font-black uppercase text-zinc-500'>
        No receipt linked
      </span>
    );
  }

  return (
    <Link
      href={href}
      className='rounded-xl border border-emerald-500/30 px-4 py-2 text-xs font-black uppercase text-emerald-200 transition hover:border-emerald-400/50 hover:bg-emerald-500/10'
    >
      Preview &amp; send
    </Link>
  );
}

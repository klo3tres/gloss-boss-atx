'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { ExceptionInlineAction, OperationException } from '@/lib/operations-snapshot';
import {
  bumpAppointmentTomorrowAction,
  createOfferFromInboxAction,
  dismissExceptionAction,
  excludePaymentInboxAction,
  excludeReceiptInboxAction,
  repairDuplicateGroupInboxAction,
  repairDuplicatePaymentsInboxAction,
  retryNotificationInboxAction,
  sendFollowUpInboxAction,
} from '@/app/(dashboard)/admin/exceptions/exception-actions';
import { ExceptionDismissMenu } from '@/components/admin/exception-dismiss-menu';

async function runAction(
  item: OperationException,
  action: ExceptionInlineAction,
): Promise<{ ok?: boolean; error?: string; message?: string; href?: string }> {
  if (action.type === 'dismiss' || action.type === 'dismiss_snooze') {
    return dismissExceptionAction(item.id, undefined, action.snoozeDays);
  }
  if (action.type === 'repair_duplicates') return repairDuplicatePaymentsInboxAction();
  if (action.type === 'repair_duplicate_group' && action.groupKey) {
    return repairDuplicateGroupInboxAction(action.groupKey);
  }
  if (action.type === 'exclude_payment' && action.paymentId) return excludePaymentInboxAction(action.paymentId);
  if (action.type === 'exclude_receipt' && action.receiptId) {
    return excludeReceiptInboxAction(action.receiptId, action.winnerId);
  }
  if (action.type === 'retry_notification' && action.outboxId) return retryNotificationInboxAction(action.outboxId);
  if (action.type === 'reschedule_weather' && (action.workOrderId || item.workOrderId)) {
    return bumpAppointmentTomorrowAction(action.workOrderId || item.workOrderId!);
  }
  if (action.type === 'send_followup') {
    return sendFollowUpInboxAction({
      fingerprint: item.id,
      email: action.customerEmail,
      phone: action.customerPhone,
      customerName: item.customerName ?? undefined,
    });
  }
  if (action.type === 'create_offer') {
    return createOfferFromInboxAction({
      fingerprint: item.id,
      customerId: action.customerId,
      email: action.customerEmail,
    });
  }
  return { error: 'Unsupported action' };
}

export function ExceptionActionButtons({ item, compact }: { item: OperationException; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const inline = item.inlineActions ?? [];

  const execute = (action: ExceptionInlineAction) => {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await runAction(item, action);
      if (res.href) window.location.href = res.href;
      if (res.error) setErr(res.error);
      else setMsg(res.message ?? 'Done.');
    });
  };

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <Link
        href={item.href}
        className="inline-flex items-center justify-center rounded-lg border border-gold/30 bg-black/60 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft hover:border-gold/50"
      >
        {item.actionLabel}
      </Link>
      {item.secondaryHref && item.secondaryActionLabel ? (
        <Link href={item.secondaryHref} className="text-[10px] font-black uppercase text-zinc-400 hover:text-white">
          {item.secondaryActionLabel}
        </Link>
      ) : null}
      {inline.map((action) => (
        <button
          key={`${action.type}-${action.label}`}
          type="button"
          disabled={pending}
          onClick={() => execute(action)}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300 hover:border-gold/30 hover:text-gold-soft disabled:opacity-50"
        >
          {action.label}
        </button>
      ))}
      <ExceptionDismissMenu
        fingerprint={item.id}
        disabled={pending}
        onDone={(message, error) => {
          if (error) setErr(error);
          else setMsg(message);
        }}
      />
      {!compact && msg ? <p className="text-[10px] text-emerald-400">{msg}</p> : null}
      {!compact && err ? <p className="text-[10px] text-red-300">{err}</p> : null}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { X, Copy, ExternalLink, FileDown } from 'lucide-react';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';

type DepositContext = {
  customer: { name: string; email: string; phone: string };
  appointment: { scheduledStart: string; address: string; vehicles: string[]; services: string[] };
  pricing: {
    subtotalCents: number;
    discountCents: number;
    creditCents: number;
    finalTotalCents: number;
    paidCents: number;
    depositPercent: number;
    depositCents: number;
    remainingBalanceCents: number;
    remainingAfterDepositCents: number;
  };
  recipient: { phone: string; email: string };
  secureLink: string;
  externalPaymentMethods: Array<{ key: string; label: string }>;
};

function money(value: number) {
  return `$${(value / 100).toFixed(2)}`;
}

function whenChicago(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function WorkOrderDepositRequestModal({
  open,
  appointmentId,
  receiptPdfHref,
  onClose,
  onUpdated,
}: {
  open: boolean;
  appointmentId: string;
  receiptPdfHref?: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { openPreview } = useOutboundPreview();
  const [context, setContext] = useState<DepositContext | null>(null);
  const [mode, setMode] = useState<'default' | 'percent' | 'fixed' | 'full' | 'arrival' | 'waive'>('default');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    void fetch(`/api/admin/work-orders/deposit-request?appointmentId=${encodeURIComponent(appointmentId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || !json.ok) throw new Error(json.error ?? 'Could not load deposit request');
        setContext(json as DepositContext);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load deposit request'));
  }, [open, appointmentId]);

  if (!open) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/work-orders/deposit-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, mode, value: value ? Number(value) : undefined }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string; depositCents?: number; secureLink?: string };
      if (!response.ok || !result.ok || !context) throw new Error(result.error ?? 'Could not prepare deposit request');
      const depositCents = result.depositCents ?? context.pricing.depositCents;
      const appointment = whenChicago(context.appointment.scheduledStart);
      const link = result.secureLink ?? context.secureLink;
      const firstName = context.customer.name.split(/\s+/)[0] || context.customer.name;
      const quick = `Hey ${firstName}, your Gloss Boss appointment is set for ${appointment}. The ${money(depositCents)} deposit locks in your appointment: ${link}`;
      const professional = `Hi ${firstName}, your Gloss Boss ATX appointment is scheduled for ${appointment}. A ${money(depositCents)} deposit is required to secure the appointment. You can review the details and submit payment here: ${link}`;
      const warm = `Hey ${firstName}, everything is updated for ${appointment}. Your ${money(depositCents)} deposit will officially lock the appointment in. You can handle it here whenever you're ready: ${link}`;
      const availableChannels = ([
        context.recipient.phone ? 'sms' : null,
        context.recipient.email ? 'email' : null,
      ].filter(Boolean)) as Array<'sms' | 'email'>;
      if (!availableChannels.length) throw new Error('This customer does not have a phone number or email address.');
      onClose();
      openPreview({
        title: 'Preview deposit request',
        channel: availableChannels[0],
        channelOptions: availableChannels,
        recipient: context.recipient.phone || context.recipient.email,
        recipients: { sms: context.recipient.phone, email: context.recipient.email },
        body: professional,
        subject: `Gloss Boss ATX — ${money(depositCents)} deposit request`,
        contextLabel: `${context.customer.name} · ${money(depositCents)} deposit`,
        toneVariants: { quick, professional, warm },
        priceCents: depositCents,
        allowSchedule: true,
        allowOwnerTest: true,
        kind: 'deposit_request',
        appointmentId,
        sendLabel: 'Send deposit request',
      });
      onUpdated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not prepare deposit request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='fixed inset-0 z-[220] flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-md sm:p-6' onClick={onClose}>
      <div className='my-auto w-full max-w-2xl rounded-3xl border border-gold/30 bg-zinc-950 p-5 shadow-2xl sm:p-7' onClick={(event) => event.stopPropagation()}>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <p className='text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>Collect payment</p>
            <h2 className='mt-1 text-2xl font-black text-white'>Request deposit</h2>
            <p className='mt-1 text-sm text-zinc-400'>Server-calculated totals and a preview before anything is sent.</p>
          </div>
          <button type='button' onClick={onClose} className='rounded-xl border border-white/10 p-2 text-zinc-400'><X className='h-5 w-5' /></button>
        </div>

        {!context && !error ? <p className='py-12 text-center text-sm text-zinc-400'>Loading authoritative work-order totals…</p> : null}
        {error ? <p className='mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200'>{error}</p> : null}
        {context ? (
          <>
            <div className='mt-5 grid gap-3 sm:grid-cols-2'>
              <div className='rounded-2xl border border-white/10 bg-black/40 p-4'>
                <p className='text-xs font-black text-white'>{context.customer.name}</p>
                <p className='mt-1 text-xs text-zinc-400'>{whenChicago(context.appointment.scheduledStart)}</p>
                <p className='mt-1 text-xs text-zinc-500'>{context.appointment.address || 'Service address on file'}</p>
                <p className='mt-2 text-xs text-zinc-300'>{context.appointment.vehicles.join(' · ')}</p>
              </div>
              <dl className='space-y-1.5 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm'>
                <div className='flex justify-between'><dt className='text-zinc-500'>Subtotal</dt><dd>{money(context.pricing.subtotalCents)}</dd></div>
                <div className='flex justify-between'><dt className='text-zinc-500'>Discounts</dt><dd className='text-emerald-300'>−{money(context.pricing.discountCents)}</dd></div>
                <div className='flex justify-between'><dt className='text-zinc-500'>Credits</dt><dd>{money(context.pricing.creditCents)}</dd></div>
                <div className='flex justify-between border-t border-white/10 pt-1.5'><dt className='text-zinc-400'>Final total</dt><dd className='font-black'>{money(context.pricing.finalTotalCents)}</dd></div>
                <div className='flex justify-between'><dt className='text-zinc-500'>Already paid</dt><dd>{money(context.pricing.paidCents)}</dd></div>
                <div className='flex justify-between'><dt className='text-zinc-500'>Current policy</dt><dd>{context.pricing.depositPercent}%</dd></div>
                <div className='flex justify-between'><dt className='text-zinc-500'>Suggested deposit</dt><dd className='font-black text-gold-soft'>{money(context.pricing.depositCents)}</dd></div>
                <div className='flex justify-between'><dt className='text-zinc-500'>Current balance</dt><dd>{money(context.pricing.remainingBalanceCents)}</dd></div>
                <div className='flex justify-between'><dt className='text-zinc-500'>After suggested deposit</dt><dd className='font-black text-white'>{money(context.pricing.remainingAfterDepositCents)}</dd></div>
              </dl>
            </div>

            <div className='mt-5 grid gap-3 sm:grid-cols-2'>
              <label className='text-xs font-bold text-zinc-300'>
                Deposit policy
                <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className='mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-black px-3 text-white'>
                  <option value='default'>Default percentage ({context.pricing.depositPercent}%)</option>
                  <option value='percent'>Custom percentage</option>
                  <option value='fixed'>Custom fixed amount</option>
                  <option value='full'>Pay in full</option>
                  <option value='arrival'>Pay on arrival</option>
                  <option value='waive'>Waive deposit</option>
                </select>
              </label>
              {mode === 'percent' || mode === 'fixed' ? (
                <label className='text-xs font-bold text-zinc-300'>
                  {mode === 'percent' ? 'Percentage' : 'Fixed amount ($)'}
                  <input value={value} onChange={(event) => setValue(event.target.value)} type='number' min='0' max={mode === 'percent' ? 100 : undefined} step={mode === 'percent' ? 1 : 0.01} className='mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-black px-3 text-white' />
                </label>
              ) : <div />}
            </div>

            <div className='mt-5 rounded-2xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-400'>
              <p><strong className='text-white'>Available:</strong> Stripe card checkout, including Apple Pay or Google Pay when the customer’s device and Stripe support them.</p>
              {context.externalPaymentMethods?.length ? (
                <p className='mt-2'><strong className='text-white'>Enabled external methods:</strong> {context.externalPaymentMethods.map((method) => method.label).join(' · ')}</p>
              ) : null}
              <p className='mt-2'><strong className='text-white'>Recipient:</strong> {context.recipient.phone || 'No phone'} · {context.recipient.email || 'No email'}</p>
            </div>

            <div className='mt-5 flex flex-wrap gap-2'>
              <button type='button' disabled={busy} onClick={() => void save()} className='min-h-11 rounded-xl bg-gold px-5 text-xs font-black uppercase text-black disabled:opacity-50'>
                {busy ? 'Preparing…' : 'Preview deposit request'}
              </button>
              <button type='button' onClick={() => void navigator.clipboard.writeText(context.secureLink)} className='inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-black uppercase text-zinc-200'><Copy className='h-4 w-4' /> Copy secure link</button>
              <a href={context.secureLink} target='_blank' rel='noreferrer' className='inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-black uppercase text-zinc-200'><ExternalLink className='h-4 w-4' /> Open customer page</a>
              {receiptPdfHref ? <a href={receiptPdfHref} className='inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-black uppercase text-zinc-200'><FileDown className='h-4 w-4' /> Download invoice PDF</a> : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

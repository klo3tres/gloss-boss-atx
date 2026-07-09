'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';
import { createFleetQuoteAction } from '@/app/(dashboard)/admin/titan/fleet-quote-actions';

const FLEET_SIZES = [
  { key: 'small', label: 'Small (1–5 vehicles)', min: 1, max: 5, discount: 0 },
  { key: 'medium', label: 'Medium (6–15 vehicles)', min: 6, max: 15, discount: 0.05 },
  { key: 'large', label: 'Large (15+ vehicles)', min: 16, max: 99, discount: 0.1 },
] as const;

const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly', discount: 0.15 },
  { key: 'biweekly', label: 'Bi-weekly', discount: 0.1 },
  { key: 'monthly', label: 'Monthly', discount: 0.05 },
  { key: 'quarterly', label: 'Quarterly', discount: 0 },
  { key: 'one_time', label: 'One-time', discount: 0 },
] as const;

export function FleetQuoteWizard({
  opportunityId,
  businessName,
  contactName,
  contactEmail,
  contactPhone,
  serviceOptions,
}: {
  opportunityId?: string;
  businessName?: string;
  contactName?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  serviceOptions: { slug: string; title: string; priceCents?: number; durationMinutes?: number }[];
}) {
  const router = useRouter();
  const { openPreview } = useOutboundPreview();
  const [pending, startTransition] = useTransition();
  const [vehicleCount, setVehicleCount] = useState(5);
  const [fleetSize, setFleetSize] = useState<(typeof FLEET_SIZES)[number]['key']>('small');
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]['key']>('monthly');
  const [serviceSlug, setServiceSlug] = useState(serviceOptions[0]?.slug ?? 'exterior-wash');
  const [perVehicleDollars, setPerVehicleDollars] = useState(
    serviceOptions[0]?.priceCents ? (serviceOptions[0].priceCents / 100).toFixed(0) : '75',
  );
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [waterPower, setWaterPower] = useState('water_ok');
  const [timeWindow, setTimeWindow] = useState('business_hours');
  const [depositPercent, setDepositPercent] = useState(25);
  const [msg, setMsg] = useState<string | null>(null);

  const service = serviceOptions.find((s) => s.slug === serviceSlug);
  const perVehicleCents = Math.round(Number(perVehicleDollars) * 100) || 0;
  const fleetMeta = FLEET_SIZES.find((f) => f.key === fleetSize)!;
  const freqMeta = FREQUENCIES.find((f) => f.key === frequency)!;

  const pricing = useMemo(() => {
    const subtotal = perVehicleCents * vehicleCount;
    const fleetDisc = Math.round(subtotal * fleetMeta.discount);
    const recurringDisc = Math.round((subtotal - fleetDisc) * freqMeta.discount);
    const total = subtotal - fleetDisc - recurringDisc;
    const monthlyVisits = frequency === 'weekly' ? 4 : frequency === 'biweekly' ? 2 : frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 0.33 : 0;
    const monthlyValue = monthlyVisits > 0 ? Math.round(total * monthlyVisits) : 0;
    return { subtotal, fleetDisc, recurringDisc, total, monthlyValue };
  }, [perVehicleCents, vehicleCount, fleetMeta, freqMeta, frequency]);

  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

  const quoteSummary = `Fleet quote for ${businessName ?? 'your business'}:
${vehicleCount} vehicles × ${fmt(perVehicleCents)} = ${fmt(pricing.subtotal)}
Fleet size discount: -${fmt(pricing.fleetDisc)}
${frequency !== 'one_time' ? `${freqMeta.label} recurring discount: -${fmt(pricing.recurringDisc)}` : ''}
Total per visit: ${fmt(pricing.total)}
${pricing.monthlyValue > 0 ? `Est. monthly value: ${fmt(pricing.monthlyValue)}` : ''}
On-site: ${address || 'TBD'} · ${timeWindow.replace(/_/g, ' ')}`;

  const saveAndSend = (channel: 'sms' | 'email') => {
    const recipient = channel === 'sms' ? contactPhone : contactEmail;
    if (!recipient) {
      setMsg(channel === 'sms' ? 'Add a phone number to send SMS.' : 'Add an email to send quote.');
      return;
    }
    openPreview({
      title: 'Send fleet quote',
      channel,
      recipient,
      body: `Hi ${contactName ?? 'there'}, Kyle with Gloss Boss ATX.\n\n${quoteSummary}\n\nReply if you'd like to lock in a route or schedule a trial visit.`,
      subject: `Fleet quote — ${businessName ?? 'Gloss Boss ATX'}`,
      contextLabel: businessName,
      priceCents: pricing.total,
      onSend: async (final) => {
        const res = await createFleetQuoteAction({
          opportunityId,
          businessName,
          contactName,
          contactEmail,
          contactPhone,
          vehicleCount,
          fleetSize,
          frequency,
          serviceSlug,
          perVehicleCents,
          address,
          notes: `${notes}\n\n${final.body}`,
          waterPower,
          timeWindow,
          depositPercent,
          sendChannel: channel,
          sendBody: final.body,
          sendSubject: final.subject,
          sendTo: recipient,
        });
        if (!res.error) router.refresh();
        return res;
      },
    });
  };

  return (
    <div className="space-y-4 rounded-2xl border border-cyan-500/20 bg-black/40 p-4">
      <p className="text-[10px] font-black uppercase tracking-wider text-cyan-300">Fleet quote wizard</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-500">
          Business
          <input value={businessName ?? ''} readOnly className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-zinc-500">
          Vehicle count
          <input type="number" min={1} max={99} value={vehicleCount} onChange={(e) => setVehicleCount(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-zinc-500 sm:col-span-2">
          Fleet size tier
          <select value={fleetSize} onChange={(e) => setFleetSize(e.target.value as typeof fleetSize)} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white">
            {FLEET_SIZES.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          Service
          <select value={serviceSlug} onChange={(e) => setServiceSlug(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white">
            {serviceOptions.map((s) => (
              <option key={s.slug} value={s.slug}>{s.title}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          Per-vehicle price ($)
          <input type="number" value={perVehicleDollars} onChange={(e) => setPerVehicleDollars(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-zinc-500 sm:col-span-2">
          Frequency
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white">
            {FREQUENCIES.map((f) => (
              <option key={f.key} value={f.key}>{f.label} {f.discount > 0 ? `(${Math.round(f.discount * 100)}% off)` : ''}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-500 sm:col-span-2">
          On-site address
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Austin/Round Rock service address" className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-zinc-500">
          Water / power
          <select value={waterPower} onChange={(e) => setWaterPower(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white">
            <option value="water_ok">Water available on-site</option>
            <option value="water_needed">Need water hookup</option>
            <option value="power_needed">Need power</option>
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          Preferred window
          <select value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white">
            <option value="business_hours">Business hours</option>
            <option value="early_morning">Early morning</option>
            <option value="after_hours">After hours</option>
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          Deposit %
          <input type="number" min={0} max={100} value={depositPercent} onChange={(e) => setDepositPercent(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-zinc-500 sm:col-span-2">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white" />
        </label>
      </div>

      <dl className="rounded-xl border border-white/8 bg-zinc-900/50 p-4 text-sm space-y-1">
        <div className="flex justify-between"><dt className="text-zinc-500">Subtotal</dt><dd className="font-mono text-white">{fmt(pricing.subtotal)}</dd></div>
        {pricing.fleetDisc > 0 ? <div className="flex justify-between"><dt className="text-zinc-500">Fleet discount</dt><dd className="font-mono text-emerald-300">-{fmt(pricing.fleetDisc)}</dd></div> : null}
        {pricing.recurringDisc > 0 ? <div className="flex justify-between"><dt className="text-zinc-500">Recurring discount</dt><dd className="font-mono text-emerald-300">-{fmt(pricing.recurringDisc)}</dd></div> : null}
        <div className="flex justify-between border-t border-white/8 pt-2"><dt className="font-black text-gold-soft">Total / visit</dt><dd className="font-mono text-lg font-black text-white">{fmt(pricing.total)}</dd></div>
        {pricing.monthlyValue > 0 ? <div className="flex justify-between"><dt className="text-zinc-500">Est. monthly</dt><dd className="font-mono text-emerald-300">{fmt(pricing.monthlyValue)}</dd></div> : null}
        <p className="text-[10px] text-zinc-600">~{service?.durationMinutes ?? 60} min/vehicle est.</p>
      </dl>

      <pre className="max-h-32 overflow-auto rounded-lg border border-white/5 bg-black p-3 text-[10px] text-zinc-400 whitespace-pre-wrap">{quoteSummary}</pre>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => saveAndSend('sms')} className="rounded-lg bg-emerald-500 px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50">
          Preview & send SMS
        </button>
        <button type="button" disabled={pending} onClick={() => saveAndSend('email')} className="rounded-lg border border-cyan-500/30 px-4 py-2 text-[10px] font-black uppercase text-cyan-200 disabled:opacity-50">
          Preview & send email
        </button>
      </div>
      {msg ? <p className="text-xs text-rose-300">{msg}</p> : null}
    </div>
  );
}

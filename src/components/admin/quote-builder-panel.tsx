'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createLeadEstimateAction,
  createContactEstimateAction,
  previewLeadEstimateAction,
  sendLeadEstimateEmailWithBodyAction,
  sendLeadEstimateSmsWithBodyAction,
} from '@/app/(dashboard)/admin/estimate-actions';
import type { ServiceEstimate } from '@/lib/service-estimates';
import { formatChicagoDateTime } from '@/lib/chicago-time';
import { displayMoney } from '@/lib/display-format';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';
import { buildToneVariants } from '@/lib/outbound-message-tones';

const VEHICLE_CLASSES = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'truck', label: 'Truck' },
  { value: 'van', label: 'Van' },
  { value: 'large', label: 'Large / XL' },
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  declined: 'Declined',
  deposit_paid: 'Deposit paid',
  converted: 'Work order',
  expired: 'Expired',
};

export function QuoteBuilderPanel({
  leadId,
  opportunityId,
  customerId,
  contactName,
  leadEmail,
  leadPhone,
  estimates,
  serviceOptions,
  contextLabel = 'Quote',
}: {
  leadId?: string;
  opportunityId?: string;
  customerId?: string;
  contactName?: string;
  leadEmail?: string | null;
  leadPhone?: string | null;
  estimates: ServiceEstimate[];
  serviceOptions: { slug: string; title: string; priceCents?: number; durationMinutes?: number }[];
  contextLabel?: string;
}) {
  const router = useRouter();
  const { openPreview } = useOutboundPreview();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [serviceSlug, setServiceSlug] = useState(serviceOptions[0]?.slug ?? '');
  const [vehicleClass, setVehicleClass] = useState('sedan');
  const [totalDollars, setTotalDollars] = useState(
    serviceOptions[0]?.priceCents ? (serviceOptions[0].priceCents / 100).toFixed(0) : '199',
  );
  const [durationMinutes, setDurationMinutes] = useState(serviceOptions[0]?.durationMinutes ?? 120);
  const [notes, setNotes] = useState('');
  const [draftEstimateId, setDraftEstimateId] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);

  const selectedService = useMemo(
    () => serviceOptions.find((s) => s.slug === serviceSlug),
    [serviceOptions, serviceSlug],
  );

  const totalCents = Math.round(Number(totalDollars) * 100);

  const ensureDraft = async (): Promise<{ estimateId: string; publicUrl: string } | null> => {
    if (draftEstimateId && publicUrl) return { estimateId: draftEstimateId, publicUrl };
    if (leadId) {
      const created = await createLeadEstimateAction({
        leadId,
        serviceSlug,
        vehicleClass,
        totalCents,
        notes: notes.trim() || undefined,
      });
      if (created.error || !created.estimateId) {
        setErr(created.error ?? 'Could not create quote');
        return null;
      }
      setDraftEstimateId(created.estimateId);
      const url = created.publicUrl ?? (typeof window !== 'undefined' ? `${window.location.origin}/book` : '/book');
      setPublicUrl(url);
      return { estimateId: created.estimateId, publicUrl: url };
    }
    if (customerId || opportunityId) {
      const created = await createContactEstimateAction({
        customerId,
        opportunityId,
        contactName: contactName ?? 'Customer',
        contactEmail: leadEmail,
        contactPhone: leadPhone,
        serviceSlug,
        vehicleClass,
        totalCents,
        notes: notes.trim() || undefined,
      });
      if (created.error || !created.estimateId) {
        setErr(created.error ?? 'Could not create quote');
        return null;
      }
      setDraftEstimateId(created.estimateId);
      const url = created.publicUrl ?? (typeof window !== 'undefined' ? `${window.location.origin}/book` : '/book');
      setPublicUrl(url);
      return { estimateId: created.estimateId, publicUrl: url };
    }
    setErr('Save quote requires a linked lead, customer, or opportunity.');
    return null;
  };

  const openSmsPreview = () => {
    if (!leadPhone) {
      setErr('Add a phone number first.');
      return;
    }
    void (async () => {
      const draft = await ensureDraft();
      if (!draft) return;
      const preview = leadId
        ? await previewLeadEstimateAction({ leadId, serviceSlug, totalCents, vehicleClass })
        : { smsBody: `Gloss Boss quote: ${displayMoney(totalCents)} — ${draft.publicUrl}` };
      const tones = buildToneVariants(preview.smsBody ?? '', {
        name: contactName,
        price: displayMoney(totalCents),
        bookLink: draft.publicUrl,
      });
      openPreview({
        title: 'Send quote SMS',
        channel: 'sms',
        recipient: leadPhone,
        body: tones.professional,
        toneVariants: tones,
        contextLabel: `${contextLabel}${opportunityId ? ` · opp ${opportunityId.slice(0, 8)}` : ''}`,
        priceCents: totalCents,
        durationMinutes,
        onSend: async (final) => {
          const res = await sendLeadEstimateSmsWithBodyAction(draft.estimateId, final.body);
          if (!res.error) router.refresh();
          return res;
        },
      });
    })();
  };

  const openEmailPreview = () => {
    if (!leadEmail) {
      setErr('Add an email first.');
      return;
    }
    void (async () => {
      const draft = await ensureDraft();
      if (!draft) return;
      const preview = leadId
        ? await previewLeadEstimateAction({ leadId, serviceSlug, totalCents, vehicleClass })
        : {
            emailSubject: `Gloss Boss estimate — ${displayMoney(totalCents)}`,
            emailBody: `Your quote: ${displayMoney(totalCents)} · ~${durationMinutes} min · ${draft.publicUrl}`,
          };
      openPreview({
        title: 'Send quote email',
        channel: 'email',
        recipient: leadEmail,
        subject: preview.emailSubject,
        body: preview.emailBody ?? '',
        contextLabel,
        priceCents: totalCents,
        durationMinutes,
        onSend: async (final) => {
          const res = await sendLeadEstimateEmailWithBodyAction(draft.estimateId, {
            subject: final.subject,
            body: final.body,
          });
          if (!res.error) router.refresh();
          return res;
        },
      });
    })();
  };

  return (
    <div className="space-y-4 rounded-2xl border border-gold/20 bg-black/40 p-4">
      <div>
        <h4 className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Quote builder</h4>
        <p className="mt-1 text-[10px] text-zinc-500">Build price, preview message, send in under 60 seconds.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-[9px] font-black uppercase text-zinc-500 sm:col-span-2">
          Service
          <select
            value={serviceSlug}
            onChange={(e) => {
              const slug = e.target.value;
              setServiceSlug(slug);
              const match = serviceOptions.find((s) => s.slug === slug);
              if (match?.priceCents) setTotalDollars(String(Math.round(match.priceCents / 100)));
              if (match?.durationMinutes) setDurationMinutes(match.durationMinutes);
            }}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-white"
          >
            {serviceOptions.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[9px] font-black uppercase text-zinc-500">
          Vehicle
          <select
            value={vehicleClass}
            onChange={(e) => setVehicleClass(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-white"
          >
            {VEHICLE_CLASSES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[9px] font-black uppercase text-zinc-500">
          Price ($)
          <input
            type="number"
            min={1}
            value={totalDollars}
            onChange={(e) => setTotalDollars(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-white"
          />
        </label>
        <label className="block text-[9px] font-black uppercase text-zinc-500">
          Duration (min)
          <input
            type="number"
            min={30}
            step={15}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value) || 120)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-white"
          />
        </label>
        <label className="block text-[9px] font-black uppercase text-zinc-500 sm:col-span-2">
          Notes on quote
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-white"
          />
        </label>
      </div>

      <p className="text-[11px] text-zinc-400">
        Titan estimate: <span className="text-gold-soft">{displayMoney(totalCents)}</span> · ~{durationMinutes} min
        {selectedService ? ` · ${selectedService.title}` : ''}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !leadId}
          onClick={() => {
            setErr(null);
            startTransition(async () => {
              const d = await ensureDraft();
              if (d) setMsg(`Draft saved. Link: ${d.publicUrl}`);
            });
          }}
          className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-300"
        >
          Save draft
        </button>
        <button
          type="button"
          disabled={!leadPhone}
          onClick={openSmsPreview}
          className="rounded-xl bg-gold px-3 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50"
        >
          Preview & send SMS
        </button>
        <button
          type="button"
          disabled={!leadEmail}
          onClick={openEmailPreview}
          className="rounded-xl border border-gold/40 px-3 py-2 text-[10px] font-black uppercase text-gold-soft disabled:opacity-50"
        >
          Preview & send email
        </button>
        {publicUrl ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(publicUrl);
              setMsg('Quote link copied.');
            }}
            className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-400"
          >
            Copy link
          </button>
        ) : null}
        {customerId ? (
          <Link href={`/admin/customers/${customerId}`} className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-400">
            Customer
          </Link>
        ) : null}
        <Link href="/book" className="rounded-xl border border-emerald-500/30 px-3 py-2 text-[10px] font-black uppercase text-emerald-200">
          Booking link
        </Link>
      </div>

      {msg ? <p className="text-[11px] text-emerald-400">{msg}</p> : null}
      {err ? <p className="text-[11px] text-red-300">{err}</p> : null}

      {estimates.length > 0 ? (
        <ul className="space-y-2 border-t border-white/5 pt-3">
          {estimates.map((est) => (
            <li key={est.id} className="rounded-xl border border-white/5 bg-zinc-950/50 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-black text-white">{displayMoney(est.totalCents)}</p>
                  <p className="text-[10px] text-zinc-500">
                    {STATUS_LABELS[est.status] ?? est.status}
                    {est.sentAt ? ` · ${formatChicagoDateTime(est.sentAt)}` : ''}
                  </p>
                </div>
                <Link href={`/estimate/${est.accessToken}`} target="_blank" className="text-[10px] font-black uppercase text-gold">
                  View
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

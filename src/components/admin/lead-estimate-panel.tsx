'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createLeadEstimateAction,
  sendLeadEstimateAction,
} from '@/app/(dashboard)/admin/estimate-actions';
import type { ServiceEstimate } from '@/lib/service-estimates';
import { formatChicagoDateTime } from '@/lib/chicago-time';
import { displayMoney } from '@/lib/display-format';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  declined: 'Declined',
  deposit_paid: 'Deposit paid',
  converted: 'Work order',
  expired: 'Expired',
};

export function LeadEstimatePanel({
  leadId,
  leadEmail,
  estimates,
  serviceOptions,
}: {
  leadId: string;
  leadEmail?: string | null;
  estimates: ServiceEstimate[];
  serviceOptions: { slug: string; title: string; priceCents?: number }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [serviceSlug, setServiceSlug] = useState(serviceOptions[0]?.slug ?? '');
  const [totalDollars, setTotalDollars] = useState(
    serviceOptions[0]?.priceCents ? (serviceOptions[0].priceCents / 100).toFixed(0) : '199',
  );
  const [notes, setNotes] = useState('');

  const createAndSend = (sendAfterCreate: boolean) => {
    setMsg(null);
    setErr(null);
    const totalCents = Math.round(Number(totalDollars) * 100);
    if (!serviceSlug || !Number.isFinite(totalCents) || totalCents <= 0) {
      setErr('Pick a service and enter a valid total.');
      return;
    }
    startTransition(async () => {
      const created = await createLeadEstimateAction({
        leadId,
        serviceSlug,
        totalCents,
        notes: notes.trim() || undefined,
      });
      if (created.error) {
        setErr(created.error);
        return;
      }
      if (sendAfterCreate && created.estimateId) {
        const sent = await sendLeadEstimateAction(created.estimateId);
        if (sent.error) {
          setErr(sent.error);
          return;
        }
        setMsg('Estimate created and emailed to customer.');
      } else {
        setMsg(created.publicUrl ? `Draft created. Share link: ${created.publicUrl}` : 'Draft estimate created.');
      }
      router.refresh();
    });
  };

  const sendExisting = (estimateId: string) => {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await sendLeadEstimateAction(estimateId);
      if (res.error) setErr(res.error);
      else {
        setMsg('Estimate sent to customer.');
        router.refresh();
      }
    });
  };

  return (
    <div className="border-t border-white/5 pt-4 space-y-4">
      <div>
        <h4 className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Estimate pipeline</h4>
        <p className="mt-1 text-[10px] text-zinc-500">
          Lead → estimate → customer approval → deposit → work order
        </p>
      </div>

      {!leadEmail ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-200">
          Add an email to this lead before sending an estimate.
        </p>
      ) : null}

      <div className="space-y-2 rounded-2xl border border-white/5 bg-black/40 p-3">
        <label className="block text-[9px] font-black uppercase text-zinc-500">
          Service
          <select
            value={serviceSlug}
            onChange={(e) => {
              const slug = e.target.value;
              setServiceSlug(slug);
              const match = serviceOptions.find((s) => s.slug === slug);
              if (match?.priceCents) setTotalDollars(String(Math.round(match.priceCents / 100)));
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
          Quote total ($)
          <input
            type="number"
            min={1}
            step={1}
            value={totalDollars}
            onChange={(e) => setTotalDollars(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-white"
          />
        </label>
        <label className="block text-[9px] font-black uppercase text-zinc-500">
          Notes (shown on estimate)
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-white"
          />
        </label>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => createAndSend(false)}
            className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-300 hover:border-gold/30 disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            type="button"
            disabled={pending || !leadEmail}
            onClick={() => createAndSend(true)}
            className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-[10px] font-black uppercase text-gold-soft hover:border-gold/60 disabled:opacity-50"
          >
            Create & send
          </button>
        </div>
      </div>

      {msg ? <p className="text-[11px] text-emerald-400">{msg}</p> : null}
      {err ? <p className="text-[11px] text-red-300">{err}</p> : null}

      {estimates.length > 0 ? (
        <ul className="space-y-2">
          {estimates.map((est) => (
            <li key={est.id} className="rounded-xl border border-white/5 bg-zinc-950/50 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-black uppercase text-white">{displayMoney(est.totalCents)}</p>
                  <p className="text-[10px] text-zinc-500">
                    {STATUS_LABELS[est.status] ?? est.status}
                    {est.sentAt ? ` · sent ${formatChicagoDateTime(est.sentAt)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/estimate/${est.accessToken}`}
                    target="_blank"
                    className="text-[10px] font-black uppercase text-gold hover:underline"
                  >
                    View
                  </Link>
                  {est.status === 'draft' && leadEmail ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => sendExisting(est.id)}
                      className="text-[10px] font-black uppercase text-zinc-400 hover:text-white"
                    >
                      Send
                    </button>
                  ) : null}
                  {est.appointmentId ? (
                    <Link
                      href={`/admin/work-orders/${est.appointmentId}`}
                      className="text-[10px] font-black uppercase text-emerald-400 hover:underline"
                    >
                      Work order
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[10px] italic text-zinc-600">No estimates yet for this lead.</p>
      )}
    </div>
  );
}

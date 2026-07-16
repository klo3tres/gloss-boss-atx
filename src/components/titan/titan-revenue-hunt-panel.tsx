'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Phone, Mail, ExternalLink } from 'lucide-react';
import type { RevenueOpportunity } from '@/lib/titan/revenue-opportunities';
import { OPPORTUNITY_TYPE_LABELS, STATUS_LABELS, whyTitanPicked } from '@/lib/titan/revenue-opportunities';
import { displayMoney } from '@/lib/display-format';
import {
  markOpportunityStatusAction,
  scheduleFollowUpAction,
} from '@/app/(dashboard)/admin/titan/opportunity-actions';
import { sendPreviewedSmsAction } from '@/app/(dashboard)/admin/outbound-message-actions';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';
import { buildToneVariants } from '@/lib/outbound-message-tones';
import { OpportunityDrawer } from '@/components/titan/opportunity-drawer';

function money(cents: number) {
  return displayMoney(cents);
}

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

function HuntCard({ opp, compact, onOpen }: { opp: RevenueOpportunity; compact?: boolean; onOpen: () => void }) {
  const router = useRouter();
  const { openPreview } = useOutboundPreview();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [customDate, setCustomDate] = useState('');

  const act = (fn: () => Promise<{ ok?: boolean; error?: string }>, success: string) => {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setMsg(res.error);
      else {
        setMsg(success);
        setShowFollowUp(false);
        router.refresh();
      }
    });
  };

  return (
    <article className="rounded-2xl border border-emerald-500/20 bg-black/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">
            {OPPORTUNITY_TYPE_LABELS[opp.opportunityType] ?? opp.opportunityType} · {STATUS_LABELS[opp.status]}
          </p>
          <button type="button" onClick={onOpen} className="mt-1 text-left text-base font-black text-white hover:text-gold-soft hover:underline">{opp.title}</button>
          {opp.contactName ? <p className="mt-1 text-xs text-zinc-400">{opp.contactName}</p> : null}
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-lg font-black text-emerald-300">{money(opp.estimatedRevenueCents)}</p>
          <p className="text-[10px] text-zinc-500">{opp.confidenceScore}% confidence</p>
        </div>
      </div>

      {!compact ? (
        <p className="mt-3 rounded-xl border border-white/6 bg-white/5 px-3 py-2 text-xs text-cyan-100">
          <span className="font-black uppercase text-cyan-300">Why Titan picked it: </span>
          {whyTitanPicked(opp)}
        </p>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-zinc-300">{opp.recommendedMessage}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onOpen} className="rounded-lg border border-gold/30 px-3 py-2 text-[10px] font-black uppercase text-gold-soft">
          Open details
        </button>
        {opp.contactPhone ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const tones = buildToneVariants(opp.recommendedMessage, { name: opp.contactName ?? undefined });
              openPreview({
                title: 'Send hunt SMS',
                channel: 'sms',
                recipient: opp.contactPhone!,
                body: tones.professional,
                toneVariants: tones,
                contextLabel: opp.title,
                onSend: async (final) => {
                  const res = await sendPreviewedSmsAction({
                    to: opp.contactPhone!,
                    body: final.body,
                    kind: 'revenue_hunt',
                    entityType: 'opportunity',
                    entityId: opp.id,
                  });
                  if (!res.error) {
                    await markOpportunityStatusAction(opp.id, 'contacted');
                    router.refresh();
                  }
                  return res;
                },
              });
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-gold px-3 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50"
          >
            Preview & send SMS
          </button>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            copyText(opp.recommendedMessage);
            setMsg('Message copied.');
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50"
        >
          <Copy className="h-3 w-3" /> Copy message
        </button>
        {opp.contactPhone ? (
          <a href={`tel:${opp.contactPhone}`} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-white">
            <Phone className="h-3 w-3" /> Call
          </a>
        ) : null}
        {opp.contactEmail ? (
          <a href={`mailto:${opp.contactEmail}`} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-white">
            <Mail className="h-3 w-3" /> Email
          </a>
        ) : null}
        {opp.socialUrl ? (
          <a href={opp.socialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-white">
            <ExternalLink className="h-3 w-3" /> Profile
          </a>
        ) : null}
        <button type="button" disabled={pending} onClick={() => act(() => markOpportunityStatusAction(opp.id, 'contacted'), 'Marked contacted.')} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-[10px] font-black uppercase text-emerald-200 disabled:opacity-50">
          Mark contacted
        </button>
        <button type="button" disabled={pending} onClick={() => act(() => markOpportunityStatusAction(opp.id, 'booked'), 'Marked booked!')} className="rounded-lg border border-gold/30 px-3 py-2 text-[10px] font-black uppercase text-gold-soft disabled:opacity-50">
          Mark booked
        </button>
        <button type="button" disabled={pending} onClick={() => act(() => markOpportunityStatusAction(opp.id, 'lost'), 'Marked lost.')} className="rounded-lg border border-rose-500/25 px-3 py-2 text-[10px] font-black uppercase text-rose-200 disabled:opacity-50">
          Mark lost
        </button>
        <button type="button" disabled={pending} onClick={() => act(() => markOpportunityStatusAction(opp.id, 'ignored'), 'Dismissed and removed.')} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-400 disabled:opacity-50">
          Dismiss
        </button>
        <button type="button" disabled={pending} onClick={() => setShowFollowUp((v) => !v)} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-300 disabled:opacity-50">
          Schedule follow-up
        </button>
      </div>

      {showFollowUp ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-white/8 pt-3">
          {(['tomorrow', '2days', '3days', '1week'] as const).map((p) => (
            <button
              key={p}
              type="button"
              disabled={pending}
              onClick={() => act(() => scheduleFollowUpAction(opp.id, p), 'Follow-up scheduled.')}
              className="rounded-lg bg-white/5 px-3 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50"
            >
              {p === 'tomorrow' ? 'Tomorrow' : p === '2days' ? '2 days' : p === '3days' ? '3 days' : '1 week'}
            </button>
          ))}
          <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} className="rounded-lg border border-white/10 bg-black px-2 py-2 text-xs text-white" />
          <button
            type="button"
            disabled={pending || !customDate}
            onClick={() => act(() => scheduleFollowUpAction(opp.id, 'custom', `${customDate}T10:00:00`), 'Follow-up scheduled.')}
            className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50"
          >
            Custom date
          </button>
        </div>
      ) : null}

      {msg ? <p className="mt-2 text-xs text-emerald-200" role="status">{msg}</p> : null}
    </article>
  );
}

export function TitanRevenueHuntPanel({
  huntTop5,
  followUpsDue,
  recentEvents,
  tablesReady,
  totalCount,
}: {
  huntTop5: RevenueOpportunity[];
  followUpsDue: RevenueOpportunity[];
  recentEvents: Array<{ id: string; eventType: string; notes: string | null; createdAt: string; opportunityTitle?: string }>;
  tablesReady: boolean;
  totalCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openOpportunity, setOpenOpportunity] = useState<RevenueOpportunity | null>(null);

  if (!tablesReady) {
    return (
      <section className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6">
        <h2 className="text-lg font-black text-white">Revenue Hunt Today</h2>
        <p className="mt-2 text-sm text-amber-100">Apply migration <code className="text-amber-200">000100_titan_revenue_opportunities.sql</code> in Supabase, then refresh.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-emerald-500/25 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_45%),rgba(0,0,0,0.6)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300">Revenue Hunt Today</p>
            <h2 className="mt-2 text-2xl font-black text-white">Top {huntTop5.length || 0} actions to get paid</h2>
            <p className="mt-2 text-sm text-zinc-400">Ranked by urgency, revenue, confidence, and overdue follow-ups.</p>
          </div>
          <Link href="/admin/titan/opportunities" className="rounded-xl bg-emerald-500 px-4 py-2 text-[10px] font-black uppercase text-black">
            Opportunity Board ({totalCount})
          </Link>
        </div>

        {huntTop5.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/40 p-6 text-center">
            <p className="text-sm font-bold text-white">Titan needs opportunities to hunt.</p>
            <p className="mt-2 text-xs text-zinc-400">Add warm leads first: nurses, coworkers, referrals, apartments, Facebook posts, and canceled bookings.</p>
            <Link href="/admin/titan/opportunities?add=1" className="mt-4 inline-flex rounded-xl bg-gold px-5 py-3 text-[10px] font-black uppercase text-black">
              Add first opportunity
            </Link>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {huntTop5.map((opp) => (
              <HuntCard key={opp.id} opp={opp} onOpen={() => setOpenOpportunity(opp)} />
            ))}
          </div>
        )}
      </section>

      {followUpsDue.length > 0 ? (
        <section className="rounded-3xl border border-cyan-500/20 bg-black/50 p-6">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-cyan-300">Follow-ups due</h3>
          <ul className="mt-4 space-y-2">
            {followUpsDue.slice(0, 5).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 px-4 py-3 text-sm">
                <button type="button" onClick={() => setOpenOpportunity(o)} className="font-bold text-white hover:text-gold-soft hover:underline">{o.title}</button>
                <span className="text-xs text-cyan-200">{o.nextFollowUpAt ? new Date(o.nextFollowUpAt).toLocaleDateString() : 'Due'}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {recentEvents.length > 0 ? (
        <section className="rounded-3xl border border-white/8 bg-black/40 p-6">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-400">Recent outcomes</h3>
          <ul className="mt-4 space-y-2">
            {recentEvents.map((e) => (
              <li key={e.id} className="rounded-xl border border-white/6 px-4 py-3 text-xs">
                <span className="font-bold uppercase text-emerald-300">{e.eventType.replace(/_/g, ' ')}</span>
                {e.opportunityTitle ? <span className="text-white"> · {e.opportunityTitle}</span> : null}
                <p className="mt-1 text-zinc-500">{new Date(e.createdAt).toLocaleString()}{e.notes ? ` — ${e.notes}` : ''}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {openOpportunity ? (
        <OpportunityDrawer
          opp={openOpportunity}
          events={[]}
          serviceOptions={[]}
          onClose={() => setOpenOpportunity(null)}
        />
      ) : null}
    </div>
  );
}

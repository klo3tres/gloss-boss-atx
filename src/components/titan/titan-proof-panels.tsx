'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Brain,
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  DollarSign,
  Link2,
  Tag,
  Users,
} from 'lucide-react';
import type { Titan10Snapshot } from '@/lib/titan/engines/load';
import { TITAN_ENGINES } from '@/lib/titan/branding';
import { OUTCOME_LABELS, type ActionOutcome } from '@/lib/titan/engines/action-outcomes';
import { TitanCopyButton } from '@/components/titan/titan-copy-button';
import { displayMoney } from '@/lib/display-format';
import {
  advanceCloseoutAction,
  recordOutcomeAction,
  scheduleCadenceAction,
  toggleDemoModeAction,
} from '@/app/(dashboard)/admin/titan/titan-1-actions';

function money(cents: number) {
  return displayMoney(cents);
}

export function TitanProofPanels({ snapshot }: { snapshot: Titan10Snapshot }) {
  const [pending, startTransition] = useTransition();
  const { attribution, acquisitionSources, learning, touchSchedule, jobCloseouts, offers, workspaceMeta, partners } =
    snapshot;

  const recordOutcome = (actionId: string, outcome: ActionOutcome) => {
    startTransition(async () => {
      await recordOutcomeAction(actionId, outcome);
    });
  };

  const scheduleCadence = (actionId: string, label: string) => {
    startTransition(async () => {
      await scheduleCadenceAction(actionId, label);
    });
  };

  const advanceCloseout = (id: string, step: 'review' | 'referral' | 'discount' | 'follow_up') => {
    startTransition(async () => {
      await advanceCloseoutAction(id, step);
    });
  };

  return (
    <div className="space-y-6">
      {workspaceMeta.demoMode ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
          <strong>{TITAN_ENGINES.demo}</strong> — showing realistic sample data for sales demos.{' '}
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => { await toggleDemoModeAction(false); })}
            className="underline"
          >
            Exit demo
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 text-xs">
          <Link href="/admin/titan/onboarding" className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-400 hover:text-white">
            {TITAN_ENGINES.onboarding}
          </Link>
          <Link href="/admin/titan/billing" className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-400 hover:text-white">
            {TITAN_ENGINES.billing}
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => { await toggleDemoModeAction(true); })}
            className="rounded-lg border border-gold/30 px-3 py-1.5 text-gold-soft hover:bg-gold/10"
          >
            Enable demo mode
          </button>
        </div>
      )}

      {/* Attribution proof */}
      <section className="rounded-3xl border border-emerald-500/25 bg-black/55 p-5">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-300" />
          <p className="text-[10px] font-black uppercase text-emerald-300">{TITAN_ENGINES.attribution}</p>
        </div>
        <p className="mt-2 font-mono text-2xl font-black text-white">
          {money(attribution.totalAttributedCents)} <span className="text-sm font-normal text-zinc-500">proven revenue from Titan actions</span>
        </p>
        <ul className="mt-3 space-y-2">
          {attribution.proofs.slice(0, 5).map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-white/8 px-4 py-2 text-xs">
              <div>
                <p className="font-bold text-white">{p.actionLabel}</p>
                <p className="text-zinc-500">{p.matchMethod.replace('_', ' ')}</p>
              </div>
              <p className="font-mono font-black text-emerald-300">{money(p.attributedRevenueCents)}</p>
            </li>
          ))}
          {attribution.proofs.length === 0 ? (
            <p className="text-xs text-zinc-600">Send outreach, log outcomes — Titan auto-links bookings and payments within 14 days.</p>
          ) : null}
        </ul>
      </section>

      {/* Outcome tracking on daily actions */}
      <section className="rounded-3xl border border-cyan-500/20 bg-black/55 p-5">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-cyan-300" />
          <p className="text-[10px] font-black uppercase text-cyan-300">{TITAN_ENGINES.learning}</p>
        </div>
        <ul className="mt-3 space-y-2">
          {learning.insights.map((i) => (
            <li key={i.id} className="text-xs">
              <p className="font-bold text-white">{i.insight}</p>
              <p className="text-zinc-600">{i.category} · {i.confidencePercent}% confidence</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[10px] font-black uppercase text-zinc-500">Log outcome after each action</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {(Object.keys(OUTCOME_LABELS) as ActionOutcome[]).map((o) => (
            <button
              key={o}
              type="button"
              disabled={pending}
              onClick={() => {
                const id = snapshot.dailyAutonomy.topActions.find((a) => a.status === 'pending')?.id;
                if (id) recordOutcome(id, o);
              }}
              className="rounded-md border border-white/8 bg-zinc-950 px-2 py-1 text-[9px] font-bold text-zinc-400 hover:border-cyan-500/30 hover:text-cyan-200"
            >
              {OUTCOME_LABELS[o]}
            </button>
          ))}
        </div>
      </section>

      {/* Follow-up cadence */}
      <section className="rounded-3xl border border-violet-500/20 bg-black/55 p-5">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-violet-300" />
          <p className="text-[10px] font-black uppercase text-violet-300">{TITAN_ENGINES.touchSchedule}</p>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Contacted Monday → follow up Wednesday → final check Friday</p>
        {touchSchedule.dueToday.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {touchSchedule.dueToday.map((t) => (
              <li key={t.id} className={`rounded-xl border px-4 py-3 text-xs ${t.isOverdue ? 'border-red-500/30 bg-red-500/5' : 'border-white/8'}`}>
                <p className="font-bold text-white">{t.label} · {t.channel}</p>
                <p className="mt-1 text-zinc-400">{t.message}</p>
                <div className="mt-2 flex gap-2">
                  <TitanCopyButton text={t.message} label="Copy" />
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => scheduleCadence(t.id, t.label)}
                    className="text-[10px] text-violet-300 underline"
                  >
                    Schedule next
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-zinc-600">No touches due today. Mark an action done and schedule cadence.</p>
        )}
        {snapshot.dailyAutonomy.topActions[0] ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => scheduleCadence(snapshot.dailyAutonomy.topActions[0].id, snapshot.dailyAutonomy.topActions[0].title)}
            className="mt-3 rounded-lg bg-violet-500/20 px-3 py-1.5 text-[10px] font-black uppercase text-violet-200"
          >
            Schedule cadence for top action
          </button>
        ) : null}
      </section>

      {/* Acquisition sources */}
      <section className="rounded-3xl border border-orange-500/20 bg-black/55 p-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-orange-300" />
          <p className="text-[10px] font-black uppercase text-orange-300">{TITAN_ENGINES.acquisitionSources}</p>
        </div>
        <p className="mt-2 text-sm font-bold text-orange-100">{acquisitionSources.headline}</p>
        <table className="mt-4 w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-zinc-600">
              <th className="pb-2">Source</th>
              <th className="pb-2">Leads</th>
              <th className="pb-2">Bookings</th>
              <th className="pb-2">Revenue</th>
              <th className="pb-2">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {acquisitionSources.rows.filter((r) => r.leadsCount > 0 || r.revenueCents > 0).map((r) => (
              <tr key={r.id} className="border-t border-white/5 text-zinc-300">
                <td className="py-2 font-bold">{r.label}</td>
                <td className="py-2">{r.leadsCount}</td>
                <td className="py-2">{r.bookingsCount}</td>
                <td className="py-2 font-mono">{money(r.revenueCents)}</td>
                <td className={`py-2 ${r.verdict === 'scale' ? 'text-emerald-300' : r.verdict === 'reduce' ? 'text-red-300' : 'text-zinc-500'}`}>
                  {r.verdict}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Job closeout checklist */}
      <section className="rounded-3xl border border-pink-500/20 bg-black/55 p-5">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-pink-300" />
          <p className="text-[10px] font-black uppercase text-pink-300">{TITAN_ENGINES.jobCloseout}</p>
          {jobCloseouts.pendingCount > 0 ? (
            <span className="rounded-full bg-pink-500/20 px-2 py-0.5 text-[10px] font-black text-pink-200">
              {jobCloseouts.pendingCount} required
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-zinc-500">Every completed job: Review → Referral → Discount → Follow-up</p>
        <ul className="mt-3 space-y-3">
          {jobCloseouts.items.slice(0, 5).map((j) => (
            <li key={j.id} className="rounded-xl border border-white/8 p-4 text-xs">
              <p className="font-bold text-white">{j.customerName}</p>
              <p className="text-zinc-500">{j.nextStep}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Step done={j.reviewRequested} label="Review" />
                <Step done={j.referralRequested} label="Referral" />
                <Step done={j.discountOffered} label="Discount" />
                <Step done={j.followUpSent} label="Follow-up" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!j.reviewRequested ? (
                  <button type="button" disabled={pending} onClick={() => advanceCloseout(j.id, 'review')} className="rounded bg-pink-500/20 px-2 py-1 text-[10px] font-black text-pink-200">
                    Mark review sent
                  </button>
                ) : null}
                {j.reviewRequested && !j.referralRequested ? (
                  <button type="button" disabled={pending} onClick={() => advanceCloseout(j.id, 'referral')} className="rounded bg-pink-500/20 px-2 py-1 text-[10px] font-black text-pink-200">
                    Mark referral sent
                  </button>
                ) : null}
                <TitanCopyButton text={j.outreachSms} label="Copy message" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Offer builder */}
      <section className="rounded-3xl border border-gold/20 bg-black/55 p-5">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-gold-soft" />
          <p className="text-[10px] font-black uppercase text-gold-soft">{TITAN_ENGINES.offers}</p>
        </div>
        <ul className="mt-3 space-y-2">
          {offers.offers.map((o) => (
            <li key={o.id} className="rounded-xl border border-white/8 px-4 py-3 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-bold text-white">{o.name}</p>
                {o.worked === true ? (
                  <span className="text-emerald-300">Worked · {money(o.revenueCents)}</span>
                ) : o.worked === false ? (
                  <span className="text-red-300/80">No conversions</span>
                ) : (
                  <span className="text-zinc-500">{o.status}</span>
                )}
              </div>
              <p className="text-zinc-500">{o.territory} · {o.serviceFocus} · {o.discountLabel}</p>
              <div className="mt-2">
                <TitanCopyButton text={o.outreachSms} label="Copy offer SMS" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Partner enrichment */}
      <section className="rounded-3xl border border-blue-500/20 bg-black/55 p-5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-300" />
          <p className="text-[10px] font-black uppercase text-blue-300">Contact enrichment</p>
        </div>
        <ul className="mt-3 space-y-2">
          {partners.partners.slice(0, 4).map((p) => (
            <li key={p.id} className="rounded-xl border border-white/8 px-4 py-3 text-xs">
              <p className="font-bold text-white">{p.companyName}</p>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-zinc-500">
                <dt>Decision maker</dt>
                <dd className="text-zinc-300">{p.contactName ?? '—'} {p.decisionMakerTitle ? `(${p.decisionMakerTitle})` : ''}</dd>
                <dt>Phone / Email</dt>
                <dd className="text-zinc-300">{p.contactPhone ?? '—'} · {p.contactEmail ?? '—'}</dd>
                <dt>Website</dt>
                <dd className="text-zinc-300">{p.website ?? '—'}</dd>
                <dt>Source</dt>
                <dd className="text-zinc-300">{p.acquisitionSource ?? '—'}</dd>
                <dt>Notes</dt>
                <dd className="col-span-2 text-zinc-400">{p.notes ?? 'Add notes in Lead Radar'}</dd>
              </dl>
              <Link href="/admin/super" className="mt-2 inline-flex items-center gap-1 text-[10px] text-blue-300 hover:underline">
                <Link2 className="h-3 w-3" /> Edit in Lead Radar
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${done ? 'text-emerald-300' : 'text-zinc-600'}`}>
      {done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
      {label}
    </span>
  );
}

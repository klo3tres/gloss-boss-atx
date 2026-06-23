'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { MapPin, MessageSquare, Target, Truck, Users, Video } from 'lucide-react';
import type { Titan10Snapshot } from '@/lib/titan/engines/load';
import { TITAN_ENGINES } from '@/lib/titan/branding';
import { TitanEmptyState } from '@/components/titan/titan-empty-state';
import { TitanActionModal, type TitanActionModalPayload } from '@/components/titan/titan-action-modal';
import { displayMoney } from '@/lib/display-format';
import { markMissionActionComplete } from '@/app/(dashboard)/admin/titan/titan-1-actions';

function money(cents: number) {
  return displayMoney(cents);
}

export function TitanAutonomyPanels({ snapshot }: { snapshot: Titan10Snapshot }) {
  const [pending, startTransition] = useTransition();
  const [modal, setModal] = useState<TitanActionModalPayload | null>(null);
  const { dailyAutonomy, goal, revenueForecast, outreach, referral, territory, content, fleet, deals } = snapshot;

  const openAction = (a: (typeof dailyAutonomy.topActions)[0]) => {
    setModal({
      actionId: a.id,
      title: a.title,
      recipient: a.recipient,
      recipientPhone: a.recipientPhone,
      recipientEmail: a.recipientEmail,
      reason: a.reason,
      expectedRevenueCents: a.potentialCents,
      message: a.outreach?.sms ?? a.messagePreview,
      href: a.href,
    });
  };

  return (
    <>
      <div className="space-y-8" id="daily-manager">
        <section className="rounded-2xl border border-emerald-500/20 bg-zinc-950/80 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">{TITAN_ENGINES.dailyAutonomy}</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-400">Potential revenue today</p>
              <p className="font-mono text-3xl font-black text-white sm:text-4xl">{money(dailyAutonomy.morningPotentialCents)}</p>
            </div>
            <div className="text-right text-sm">
              <p className="text-zinc-500">Evening: {dailyAutonomy.evening.completed}/{dailyAutonomy.evening.total} done</p>
              <p className="text-emerald-300">{money(dailyAutonomy.evening.revenueGeneratedCents)} captured</p>
            </div>
          </div>

          {dailyAutonomy.topActions.length === 0 ? (
            <TitanEmptyState
              title="No priority actions today"
              reason="Titan only shows real revenue actions — follow-ups, estimates, exceptions, reviews."
              missing="Open follow-ups, estimates, or completed jobs"
              nextStep="Work your pipeline in Admin, then refresh Titan."
              href="/admin/follow-ups"
            />
          ) : (
            <ul className="mt-6 space-y-3">
              {dailyAutonomy.topActions.map((a, i) => (
                <li key={a.id} className="rounded-xl bg-black/40 p-4">
                  <p className="text-[10px] font-black text-emerald-300">{i + 1}. {a.status === 'completed' ? 'Done' : 'Do now'}</p>
                  <p className="mt-1 font-bold text-white">{a.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">{a.reason}</p>
                  <p className="mt-2 font-mono text-sm text-emerald-300">{money(a.potentialCents)}</p>
                  <p className="mt-2 line-clamp-2 text-xs text-zinc-600">{a.messagePreview}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openAction(a)}
                      className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[10px] font-black uppercase text-emerald-100"
                    >
                      Open action
                    </button>
                    <Link href={a.href} className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400">
                      View record
                    </Link>
                    {a.status === 'pending' ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => startTransition(async () => { await markMissionActionComplete(a.id, 'completed'); })}
                        className="text-[10px] text-zinc-600 underline"
                      >
                        Mark done
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/8 bg-zinc-950/60 p-5">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-cyan-300" />
              <p className="text-[10px] font-black uppercase text-cyan-300">{TITAN_ENGINES.goal}</p>
            </div>
            <p className="mt-2 text-lg font-black text-white">{goal.summary}</p>
            <ul className="mt-3 space-y-1 text-xs text-zinc-400">
              {goal.derivedPlan.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-white/8 bg-zinc-950/60 p-5">
            <p className="text-[10px] font-black uppercase text-zinc-400">{TITAN_ENGINES.revenueForecast}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div><dt className="text-zinc-600">Week</dt><dd className="font-mono font-black">{money(revenueForecast.thisWeekCents)}</dd></div>
              <div><dt className="text-zinc-600">Next</dt><dd className="font-mono font-black">{money(revenueForecast.nextWeekCents)}</dd></div>
              <div><dt className="text-zinc-600">Month</dt><dd className="font-mono font-black text-emerald-300">{money(revenueForecast.thisMonthCents)}</dd></div>
            </dl>
          </section>
        </div>

        {outreach.kits.length > 0 ? (
          <section className="rounded-2xl border border-white/8 bg-zinc-950/60 p-5">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-300" />
              <p className="text-[10px] font-black uppercase text-emerald-300">{TITAN_ENGINES.outreach}</p>
            </div>
            <ul className="mt-4 space-y-3">
              {outreach.kits.slice(0, 3).map((kit) => (
                <li key={kit.id} className="rounded-xl bg-black/40 p-3 text-xs">
                  <p className="font-bold text-white">{kit.label}</p>
                  <button
                    type="button"
                    onClick={() =>
                      setModal({
                        actionId: kit.id,
                        title: kit.label,
                        recipient: kit.label,
                        reason: 'Outreach kit',
                        expectedRevenueCents: kit.expectedRevenueCents,
                        message: kit.sms,
                        href: '/admin/super',
                      })
                    }
                    className="mt-2 rounded-lg bg-emerald-500/15 px-2 py-1 text-[10px] font-black uppercase text-emerald-200"
                  >
                    Open message
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <TitanEmptyState
            title="No outreach kits yet"
            reason="Outreach is generated from prospects and opportunities in Lead Radar."
            missing="titan_prospects or manual prospect"
            nextStep="Add Google Places API or log a prospect manually."
            href="/admin/super"
            actionLabel="Open Lead Radar"
          />
        )}

        {deals.length > 0 ? (
          <section className="rounded-2xl border border-white/8 bg-zinc-950/60 p-5">
            <p className="text-[10px] font-black uppercase text-violet-300">{TITAN_ENGINES.dealRoom}</p>
            <ul className="mt-3 space-y-2 text-xs">
              {deals.map((d) => (
                <li key={d.id} className="flex justify-between gap-2 rounded-lg bg-black/40 px-3 py-2">
                  <span className="font-bold text-white">{d.title}</span>
                  <span className="font-mono text-violet-200">{money(d.potentialValueCents)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-2xl border border-white/8 bg-zinc-950/60 p-5">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-orange-300" />
            <p className="text-[10px] font-black uppercase text-orange-300">{TITAN_ENGINES.territoryDomination}</p>
          </div>
          {territory.rows.every((r) => r.revenueCents === 0) ? (
            <TitanEmptyState
              title="No territory data yet"
              reason="Territory scores need completed jobs with service addresses."
              nextStep="Complete more jobs — Titan maps revenue by area."
              href="/admin/calendar"
            />
          ) : (
            <>
              <p className="mt-2 text-sm text-orange-100">{territory.headline}</p>
              <table className="mt-4 w-full text-left text-xs">
                <tbody>
                  {territory.rows.slice(0, 5).map((r) => (
                    <tr key={r.id} className="border-t border-white/5 text-zinc-300">
                      <td className="py-2">{r.label}</td>
                      <td className="py-2 font-mono">{money(r.revenueCents)}</td>
                      <td className="py-2 text-zinc-500">{r.verdict.replace('_', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/8 bg-zinc-950/60 p-5">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-pink-300" />
              <p className="text-[10px] font-black uppercase text-pink-300">{TITAN_ENGINES.content}</p>
            </div>
            {content.insights.length === 0 ? (
              <TitanEmptyState title="No content insights" reason="Log Meta posts in Titan Growth or connect content tracking." nextStep="Add posts with views/leads in Command Center." href="/admin/super" />
            ) : (
              <ul className="mt-3 space-y-2 text-xs">
                {content.insights.map((i) => (
                  <li key={i.id}><p className="font-bold text-white">{i.headline}</p><p className="text-zinc-500">{i.detail}</p></li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-2xl border border-white/8 bg-zinc-950/60 p-5">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-blue-300" />
              <p className="text-[10px] font-black uppercase text-blue-300">{TITAN_ENGINES.fleet}</p>
            </div>
            {fleet.accounts.length === 0 ? (
              <TitanEmptyState title="No fleet prospects" reason="Fleet accounts come from fleet inquiries and B2B prospects." nextStep="Add prospects manually or enable Places discovery." href="/admin/fleet" />
            ) : (
              <ul className="mt-3 space-y-2 text-xs">
                {fleet.accounts.slice(0, 4).map((f) => (
                  <li key={f.id} className="rounded-lg bg-black/40 px-3 py-2">
                    <p className="font-bold text-white">{f.companyName}</p>
                    <p className="text-zinc-500">{money(f.revenuePotentialCents)}/yr</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="rounded-2xl border border-white/8 bg-zinc-950/60 p-5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-300" />
            <p className="text-[10px] font-black uppercase text-emerald-300">{TITAN_ENGINES.referral}</p>
          </div>
          {referral.candidates.length === 0 ? (
            <TitanEmptyState title="No referral pipeline" reason="Completed jobs in the last 45 days appear here." nextStep="Complete a job — then send review + referral from closeout." href="/admin/follow-ups" />
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {referral.candidates.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/40 px-3 py-2">
                  <Link href={c.href} className="font-bold text-white hover:text-emerald-200">{c.customerName}</Link>
                  <button
                    type="button"
                    onClick={() =>
                      setModal({
                        actionId: c.id,
                        title: `Referral — ${c.customerName}`,
                        recipient: c.customerName,
                        reason: c.nextAction,
                        expectedRevenueCents: 25000,
                        message: c.outreach.sms,
                        href: c.href,
                      })
                    }
                    className="text-[10px] font-black uppercase text-emerald-300"
                  >
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <TitanActionModal open={Boolean(modal)} payload={modal} onClose={() => setModal(null)} />
    </>
  );
}

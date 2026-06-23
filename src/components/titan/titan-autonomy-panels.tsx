'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import {
  MapPin,
  MessageSquare,
  Target,
  Truck,
  Users,
  Video,
} from 'lucide-react';
import type { Titan10Snapshot } from '@/lib/titan/engines/load';
import { TITAN_ENGINES } from '@/lib/titan/branding';
import { TitanCopyButton } from '@/components/titan/titan-copy-button';
import { displayMoney } from '@/lib/display-format';
import { markMissionActionComplete } from '@/app/(dashboard)/admin/titan/titan-1-actions';

function money(cents: number) {
  return displayMoney(cents);
}

export function TitanAutonomyPanels({ snapshot }: { snapshot: Titan10Snapshot }) {
  const [pending, startTransition] = useTransition();
  const { dailyAutonomy, goal, revenueForecast, outreach, referral, territory, content, fleet, deals } = snapshot;

  const markDone = (id: string) => {
    startTransition(async () => {
      await markMissionActionComplete(id, 'completed');
    });
  };

  return (
    <div className="space-y-6">
      {/* Daily Manager — morning / evening */}
      <section className="rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/10 via-black to-zinc-950 p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-soft">{TITAN_ENGINES.dailyAutonomy}</p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-400">Morning — potential revenue today</p>
            <p className="font-mono text-4xl font-black text-gold-soft">{money(dailyAutonomy.morningPotentialCents)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-right">
            <p className="text-[10px] font-black uppercase text-zinc-500">Evening scorecard</p>
            <p className="text-sm text-white">
              Completed {dailyAutonomy.evening.completed}/{dailyAutonomy.evening.total}
            </p>
            <p className="text-xs text-emerald-300">Generated {money(dailyAutonomy.evening.revenueGeneratedCents)}</p>
            <p className="text-xs text-red-300/80">Missed {money(dailyAutonomy.evening.revenueMissedCents)}</p>
          </div>
        </div>
        <p className="mt-4 text-[10px] font-black uppercase text-zinc-500">Do these 3 things</p>
        <ul className="mt-2 space-y-2">
          {dailyAutonomy.topActions.map((a, i) => (
            <li key={a.id} className="rounded-xl border border-white/8 bg-black/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black text-gold-soft">{i + 1}. {a.status === 'completed' ? 'Done' : 'Priority'}</p>
                  <p className="font-bold text-white">{a.title}</p>
                  <p className="font-mono text-sm text-emerald-300">{money(a.potentialCents)} potential</p>
                </div>
                {a.status === 'pending' ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => markDone(a.id)}
                    className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[10px] font-black uppercase text-emerald-200"
                  >
                    Mark done
                  </button>
                ) : (
                  <span className="text-[10px] font-black uppercase text-emerald-400">Completed</span>
                )}
              </div>
              {a.outreach ? (
                <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
                  <p className="text-[10px] text-zinc-600">Ready to send:</p>
                  <p className="text-xs text-zinc-400 line-clamp-2">{a.outreach.sms}</p>
                  <TitanCopyButton text={a.outreach.sms} label="Copy SMS" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {/* Goal + Forecast row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-cyan-500/20 bg-black/55 p-5">
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
        <section className="rounded-3xl border border-white/10 bg-black/55 p-5">
          <p className="text-[10px] font-black uppercase text-zinc-400">{TITAN_ENGINES.revenueForecast}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-[10px] text-zinc-600">This week</dt>
              <dd className="font-mono font-black text-white">{money(revenueForecast.thisWeekCents)}</dd>
            </div>
            <div>
              <dt className="text-[10px] text-zinc-600">Next week</dt>
              <dd className="font-mono font-black text-white">{money(revenueForecast.nextWeekCents)}</dd>
            </div>
            <div>
              <dt className="text-[10px] text-zinc-600">This month</dt>
              <dd className="font-mono font-black text-emerald-300">{money(revenueForecast.thisMonthCents)}</dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Outreach Engine */}
      <section className="rounded-3xl border border-emerald-500/20 bg-black/55 p-5">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-emerald-300" />
          <p className="text-[10px] font-black uppercase text-emerald-300">{TITAN_ENGINES.outreach}</p>
        </div>
        <p className="mt-2 text-sm text-zinc-500">Exact messages — one click copy. SMS, email, Facebook, Nextdoor, partnership pitch.</p>
        <ul className="mt-4 space-y-4">
          {outreach.kits.slice(0, 4).map((kit) => (
            <li key={kit.id} className="rounded-xl border border-white/8 bg-zinc-950/60 p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-bold text-white">{kit.label}</p>
                <p className="font-mono text-sm text-emerald-300">{money(kit.expectedRevenueCents)}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <TitanCopyButton text={kit.sms} label="SMS" />
                <TitanCopyButton text={kit.emailBody} label="Email" />
                <TitanCopyButton text={kit.facebookDm} label="Facebook DM" />
                <TitanCopyButton text={kit.nextdoorMessage} label="Nextdoor" />
                <TitanCopyButton text={kit.partnershipPitch} label="Pitch" />
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-[10px] text-zinc-600">Follow-up sequence ({kit.followUpSequence.length})</summary>
                <ul className="mt-2 space-y-1 text-xs text-zinc-500">
                  {kit.followUpSequence.map((f) => (
                    <li key={f.day}>
                      Day {f.day} · {f.channel}: {f.message.slice(0, 100)}…
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </section>

      {/* Deal Room */}
      {deals.length > 0 ? (
        <section className="rounded-3xl border border-violet-500/20 bg-black/55 p-5">
          <p className="text-[10px] font-black uppercase text-violet-300">{TITAN_ENGINES.dealRoom}</p>
          <ul className="mt-3 space-y-2">
            {deals.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-white/8 px-4 py-3 text-xs">
                <div>
                  <p className="font-bold text-white">{d.title}</p>
                  <p className="text-zinc-500">
                    {d.status} · {d.nextAction}
                    {d.lastTouchAt ? ` · last touch ${new Date(d.lastTouchAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <p className="font-mono font-black text-violet-200">{money(d.potentialValueCents)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Territory */}
      <section className="rounded-3xl border border-orange-500/20 bg-black/55 p-5">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-orange-300" />
          <p className="text-[10px] font-black uppercase text-orange-300">{TITAN_ENGINES.territoryDomination}</p>
        </div>
        <p className="mt-2 text-sm font-bold text-orange-100">{territory.headline}</p>
        <table className="mt-4 w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-zinc-600">
              <th className="pb-2">Area</th>
              <th className="pb-2">Revenue</th>
              <th className="pb-2">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {territory.rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5 text-zinc-300">
                <td className="py-2 font-bold">{r.label}</td>
                <td className="py-2 font-mono">{money(r.revenueCents)}</td>
                <td className="py-2">
                  <span
                    className={
                      r.verdict === 'double_down'
                        ? 'text-emerald-300'
                        : r.verdict === 'reduce_focus'
                          ? 'text-red-300'
                          : 'text-zinc-500'
                    }
                  >
                    {r.verdict.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Content */}
        <section className="rounded-3xl border border-pink-500/20 bg-black/55 p-5">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-pink-300" />
            <p className="text-[10px] font-black uppercase text-pink-300">{TITAN_ENGINES.content}</p>
          </div>
          <ul className="mt-3 space-y-2">
            {content.insights.map((i) => (
              <li key={i.id} className="text-xs">
                <p className="font-bold text-white">{i.headline}</p>
                <p className="text-zinc-500">{i.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Fleet */}
        <section className="rounded-3xl border border-blue-500/20 bg-black/55 p-5">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-blue-300" />
            <p className="text-[10px] font-black uppercase text-blue-300">{TITAN_ENGINES.fleet}</p>
          </div>
          <p className="mt-2 text-sm text-zinc-500">{money(fleet.totalPotentialCents)} fleet pipeline</p>
          <ul className="mt-3 space-y-2">
            {fleet.accounts.slice(0, 4).map((f) => (
              <li key={f.id} className="rounded-lg border border-white/8 px-3 py-2 text-xs">
                <p className="font-bold text-white">{f.companyName}</p>
                <p className="text-zinc-500">
                  {f.fleetType} · {f.vehicleCount ?? '?'} vehicles · {money(f.revenuePotentialCents)}/yr
                </p>
                <div className="mt-2 flex gap-2">
                  <TitanCopyButton text={f.outreachSms} label="Copy fleet SMS" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Referral */}
      <section className="rounded-3xl border border-emerald-500/15 bg-black/55 p-5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-emerald-300" />
          <p className="text-[10px] font-black uppercase text-emerald-300">{TITAN_ENGINES.referral}</p>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Review → Referral → Discount → Follow-up for every completed customer</p>
        <ul className="mt-3 space-y-2">
          {referral.candidates.slice(0, 6).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 px-4 py-3 text-xs">
              <div>
                <Link href={c.href} className="font-bold text-white hover:text-gold-soft">
                  {c.customerName}
                </Link>
                <p className="text-zinc-500">
                  Stage: {c.stage} · {c.nextAction}
                </p>
              </div>
              <TitanCopyButton text={c.outreach.sms} label="Copy" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

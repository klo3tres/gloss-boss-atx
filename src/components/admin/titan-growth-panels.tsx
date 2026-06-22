'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  contactProspectAction,
  addProspectToPipelineAction,
  generateCommandPlanAction,
  executeCommandPlanAction,
  previewProspectOutreachAction,
  saveMarketingSpendAction,
  runPlacesDiscoveryAction,
  runTitanNightlyNowAction,
} from '@/app/(dashboard)/admin/super/titan-growth-actions';
import type { TitanBriefing } from '@/lib/titan-briefing';
import { prospectTypeLabel, type ProspectType } from '@/lib/titan/lead-radar';
import { displayMoney } from '@/lib/display-format';

function money(cents: number) {
  return displayMoney(cents);
}

export function TitanGrowthPanels({ briefing }: { briefing: TitanBriefing }) {
  const { growth } = briefing;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [commandPrompt, setCommandPrompt] = useState('Get me 5 new customers');
  const [plan, setPlan] = useState(briefing.growth.lastPlan);
  const [execLog, setExecLog] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [outreachPreview, setOutreachPreview] = useState<{
    prospectId: string;
    callScript: string;
    emailSubject: string;
    emailBody: string;
    smsBody: string;
  } | null>(null);

  const run = (fn: () => Promise<{ error?: string; ok?: boolean; log?: string[] }>) => {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setErr(res.error);
      if (res.log) setExecLog(res.log);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/10 via-black to-zinc-950 p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gold">Titan Growth OS</p>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Phases 11–15 — discover prospects, execute outreach, attribute revenue, amplify content, and approve growth plans.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await runTitanNightlyNowAction();
                return res;
              })
            }
            className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft disabled:opacity-50"
          >
            Run Titan nightly
          </button>
          <p className="text-[10px] text-zinc-600">
            Scheduled daily at 06:00 UTC (Hobby). Manual runs cover Lead Radar, leak scan, and hunt between crons.
          </p>
        </div>
        {!growth.tablesReady ? (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
            Apply Supabase migration <span className="font-mono">000088</span> to unlock Lead Radar, Outreach, Ad OS, Content Engine, and Command Layer.
          </p>
        ) : null}
      </section>

      {/* Phase 15 — Command Layer */}
      <section className="rounded-3xl border border-cyan-500/25 bg-black/60 p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300">Phase 15 — Titan Command Layer</p>
        <p className="mt-2 text-sm text-zinc-500">Tell Titan what you want. It builds a plan — you approve, it executes.</p>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const res = await generateCommandPlanAction(commandPrompt);
              if (res.error) return { error: res.error };
              if ('plan' in res && res.plan) setPlan(res.plan);
              return { ok: true };
            });
          }}
        >
          <input
            value={commandPrompt}
            onChange={(e) => setCommandPrompt(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-cyan-500/40 focus:outline-none"
            placeholder="Get me 5 new customers"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-cyan-500 px-5 py-3 text-[10px] font-black uppercase text-black disabled:opacity-50"
          >
            Generate plan
          </button>
        </form>
        {plan ? (
          <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-black/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-black uppercase text-cyan-200">Plan generated</p>
              <p className="font-mono text-sm text-emerald-300">
                Potential: {money(plan.potentialRevenueCents)}
              </p>
            </div>
            <ul className="mt-3 space-y-2">
              {plan.actions.map((a) => (
                <li key={a.id} className="rounded-xl border border-white/5 bg-black/40 px-3 py-2 text-xs text-zinc-300">
                  <span className="font-bold text-white">{a.title}</span>
                  <span className="text-zinc-500"> — {a.detail}</span>
                  {a.potentialCents ? (
                    <span className="ml-2 font-mono text-emerald-400">~{money(a.potentialCents)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            {plan.id ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const res = await executeCommandPlanAction(plan.id!);
                    return res;
                  })
                }
                className="mt-4 rounded-xl bg-emerald-500 px-5 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-50"
              >
                Approve &amp; execute
              </button>
            ) : null}
          </div>
        ) : null}
        {execLog?.length ? (
          <ul className="mt-3 space-y-1 text-[10px] text-zinc-500">
            {execLog.map((line, i) => (
              <li key={i}>· {line}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* Phase 11 — Lead Radar */}
      <section className="rounded-3xl border border-blue-500/20 bg-black/55 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-300">Phase 11 — Titan Lead Radar</p>
            <p className="mt-2 text-sm text-zinc-500">
              Titan discovers B2B opportunities every morning via Google Places — scored and ready for outreach.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !growth.radar.discovery.configured}
              title={
                growth.radar.discovery.configured
                  ? 'Run Google Places discovery now'
                  : 'Google Places API key required — use manual prospect entry'
              }
              onClick={() => run(() => runPlacesDiscoveryAction())}
              className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-[10px] font-black uppercase text-blue-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Run discovery now
            </button>
            <Link href="/admin/operations/fleet" className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white">
              Fleet inbox →
            </Link>
          </div>
        </div>

        {growth.radar.discovery.configured ? (
          growth.radar.discovery.lastRunAt ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300">New opportunities found</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Within {growth.radar.discovery.radiusMiles} miles · last scan{' '}
                    {new Date(growth.radar.discovery.lastRunAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase text-zinc-500">Potential revenue</p>
                  <p className="font-mono text-2xl font-black text-emerald-300">
                    {money(growth.radar.discovery.potentialMonthlyCents)}/mo
                  </p>
                  {growth.radar.discovery.newToday > 0 ? (
                    <p className="mt-1 text-[10px] text-emerald-400">+{growth.radar.discovery.newToday} new today</p>
                  ) : null}
                </div>
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(Object.entries(growth.radar.discovery.byType) as [ProspectType, number][])
                  .filter(([, count]) => count > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <li key={type} className="rounded-xl border border-white/5 bg-black/40 px-3 py-2">
                      <p className="font-mono text-lg font-black text-white">{count}</p>
                      <p className="text-[10px] text-zinc-500">{prospectTypeLabel(type)}</p>
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs text-blue-100">
              Places API configured. Click <span className="font-bold">Run discovery now</span> — or wait for the daily Titan nightly cron at 06:00 UTC.
            </p>
          )
        ) : (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
            Lead Radar manual mode active — Google Places not connected. Add prospects manually or paste opportunities in Opportunity Scanner.
          </p>
        )}

        {growth.radar.discovery.lastError ? (
          <p className="mt-3 text-xs text-amber-300">Last scan note: {growth.radar.discovery.lastError}</p>
        ) : null}

        <ul className="mt-4 space-y-3">
          {growth.radar.prospects.length === 0 ? (
            <li className="text-xs text-zinc-600">No prospects yet. Add fleet inquiries or manual targets.</li>
          ) : (
            growth.radar.prospects.slice(0, 8).map((p) => (
              <li key={p.id} className="rounded-2xl border border-white/5 bg-black/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase text-blue-300">Prospect score: {p.score}</p>
                    <p className="mt-1 text-lg font-black text-white">{p.companyName}</p>
                    <p className="text-xs text-zinc-500">{prospectTypeLabel(p.prospectType)}</p>
                  </div>
                  <p className="font-mono text-sm text-emerald-300">{money(p.estimatedMonthlyCents)}/mo est.</p>
                </div>
                <dl className="mt-3 grid gap-1 text-xs text-zinc-400 sm:grid-cols-2">
                  {p.distanceMiles != null ? (
                    <div>
                      <dt className="text-zinc-600">Distance</dt>
                      <dd>{p.distanceMiles} miles</dd>
                    </div>
                  ) : null}
                  {p.contactRole ? (
                    <div>
                      <dt className="text-zinc-600">Decision maker</dt>
                      <dd>{p.contactRole}</dd>
                    </div>
                  ) : null}
                  {p.scoreReason ? (
                    <div className="sm:col-span-2">
                      <dt className="text-zinc-600">Reason</dt>
                      <dd>{p.scoreReason}</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['call', 'email', 'sms', 'visit'] as const).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (ch === 'call') {
                          void previewProspectOutreachAction(p.id).then((res) => {
                            if ('outreach' in res && res.outreach) {
                              setOutreachPreview({
                                prospectId: p.id,
                                callScript: res.outreach.callScript,
                                emailSubject: res.outreach.emailSubject,
                                emailBody: res.outreach.emailBody,
                                smsBody: res.outreach.smsBody,
                              });
                            }
                          });
                          return;
                        }
                        run(() => contactProspectAction(p.id, ch));
                      }}
                      className="rounded-lg border border-white/10 bg-black px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300 hover:border-blue-500/40"
                    >
                      {ch === 'visit' ? 'Visit' : ch}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => addProspectToPipelineAction(p.id))}
                    className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft"
                  >
                    Add to pipeline
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      {outreachPreview ? (
        <section className="rounded-3xl border border-purple-500/20 bg-black/55 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-300">Phase 12 — Outreach preview</p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{outreachPreview.callScript}</p>
          <p className="mt-4 text-[10px] font-black uppercase text-zinc-500">Email</p>
          <p className="text-xs text-zinc-400">{outreachPreview.emailSubject}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-500">{outreachPreview.emailBody}</p>
          <button
            type="button"
            className="mt-3 text-[10px] font-black uppercase text-zinc-600 hover:text-white"
            onClick={() => setOutreachPreview(null)}
          >
            Close
          </button>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Phase 13 — Ad OS */}
        <section className="rounded-3xl border border-orange-500/20 bg-black/55 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-300">Phase 13 — Titan Ad OS</p>
          <p className="mt-2 text-sm text-zinc-500">Revenue attribution — stop guessing what works.</p>
          <ul className="mt-4 space-y-2">
            {growth.attribution.channels.length === 0 ? (
              <li className="text-xs text-zinc-600">Log marketing spend below to unlock ROAS.</li>
            ) : (
              growth.attribution.channels.map((ch) => (
                <li key={ch.channel} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/40 px-3 py-2 text-xs">
                  <span className="font-bold text-white">{ch.label}</span>
                  <span className="text-zinc-500">
                    {money(ch.spendCents)} spent → <span className="text-emerald-300">{money(ch.revenueCents)}</span>
                    {ch.roas != null ? <span className="ml-2 text-orange-300">{ch.roas}× ROAS</span> : null}
                  </span>
                </li>
              ))
            )}
          </ul>
          <form
            className="mt-4 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const channel = String(fd.get('channel') ?? 'facebook');
              const dollars = Number(fd.get('spend') ?? 0);
              run(() => saveMarketingSpendAction(channel, Math.round(dollars * 100)));
            }}
          >
            <select name="channel" className="rounded-lg border border-white/10 bg-black px-2 py-1.5 text-xs text-white">
              <option value="facebook">Facebook</option>
              <option value="google">Google</option>
              <option value="referral">Referral</option>
              <option value="tiktok">TikTok</option>
            </select>
            <input
              name="spend"
              type="number"
              step="0.01"
              min="0"
              placeholder="Spend $"
              className="w-24 rounded-lg border border-white/10 bg-black px-2 py-1.5 text-xs text-white"
            />
            <button type="submit" disabled={pending} className="rounded-lg bg-orange-500/20 px-3 py-1.5 text-[10px] font-black uppercase text-orange-200">
              Log spend
            </button>
          </form>
        </section>

        {/* Phase 14 — Content Engine */}
        <section className="rounded-3xl border border-pink-500/20 bg-black/55 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-300">Phase 14 — Titan Content Engine</p>
          <p className="mt-2 text-sm text-zinc-500">What content actually drives bookings.</p>
          {growth.content.topPost ? (
            <div className="mt-4 rounded-2xl border border-pink-500/20 bg-pink-500/5 p-4">
              <p className="text-[10px] font-black uppercase text-pink-200">Top performer</p>
              <p className="mt-1 font-bold text-white">{growth.content.topPost.title}</p>
              <p className="mt-2 text-xs text-zinc-400">
                {growth.content.topPost.views.toLocaleString()} views · {growth.content.topPost.leadsCount} leads ·{' '}
                {growth.content.topPost.bookingsCount} bookings · {money(growth.content.topPost.revenueCents)}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs text-zinc-600">Log reels and posts to train recommendations.</p>
          )}
          {growth.content.recommendation ? (
            <div className="mt-4 rounded-xl border border-white/5 bg-black/40 p-3 text-xs">
              <p className="font-black uppercase text-pink-200">Generate similar content</p>
              <p className="mt-2 text-zinc-300">
                <span className="text-zinc-500">Hook:</span> {growth.content.recommendation.hook}
              </p>
              <p className="mt-2 text-zinc-400">{growth.content.recommendation.caption}</p>
              <ul className="mt-2 list-inside list-disc text-zinc-500">
                {growth.content.recommendation.shotList.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      {err ? <p className="text-xs text-red-300">{err}</p> : null}
    </div>
  );
}

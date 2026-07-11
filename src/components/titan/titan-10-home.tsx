'use client';

import { TITAN_VERSION_LABEL, TITAN_PRODUCT_STAGE } from '@/lib/titan/branding';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Crosshair,
  FlaskConical,
  GitBranch,
  Handshake,
  RefreshCw,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { Titan10Snapshot } from '@/lib/titan/engines/load';
import type { TitanSystemHealth } from '@/lib/titan/system-health';
import { TITAN_ENGINES } from '@/lib/titan/branding';
import { TitanSystemHealthPanel } from '@/components/titan/titan-system-health-panel';
import { TitanSetupBanner } from '@/components/titan/titan-ui';
import { displayMoney } from '@/lib/display-format';
import {
  completeExperimentAction,
  createExperimentAction,
  runAcquisitionHuntAction,
} from '@/app/(dashboard)/admin/titan/titan-1-actions';
import { TitanProofPanels } from '@/components/titan/titan-proof-panels';
import { TitanRevenueHuntPanel } from '@/components/titan/titan-revenue-hunt-panel';
import { TitanLeadRadarTodayPanel } from '@/components/titan/titan-lead-radar-today-panel';
import { TitanConversionGoalPanel } from '@/components/titan/titan-conversion-goal-panel';
import { TitanDailyHuntChecklist } from '@/components/titan/titan-daily-hunt-checklist';
import { TodaysMoneyPlanPanel } from '@/components/titan/todays-money-plan-panel';
import type { TodaysMoneyPlan } from '@/lib/titan/todays-money-plan';
import type { loadRevenueHuntBundle } from '@/lib/titan/revenue-opportunities';
import type { LeadRadarItem } from '@/lib/titan/lead-radar-engine';
import type { ConversionGoalStats } from '@/lib/titan/lead-radar-hunt';
import type { TitanExecutionRow } from '@/lib/titan/execution';
import { TitanExecutionPanel } from '@/components/titan/titan-execution-panel';

function money(cents: number) {
  return displayMoney(cents);
}

function Section({
  title,
  subtitle,
  icon: Icon,
  accent = 'emerald',
  children,
  action,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const accentMap: Record<string, string> = {
    emerald: 'text-emerald-300 border-emerald-500/20',
    gold: 'text-gold-soft border-gold/25',
    violet: 'text-violet-300 border-violet-500/20',
    cyan: 'text-cyan-300 border-cyan-500/20',
    orange: 'text-orange-300 border-orange-500/20',
  };
  const cls = accentMap[accent] ?? accentMap.emerald;
  const [textCls, borderCls] = cls.split(' ');
  return (
    <section className={`rounded-3xl border bg-black/55 p-6 ${borderCls}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${textCls}`} />
            <p className={`text-[10px] font-black uppercase tracking-[0.28em] ${textCls}`}>{title}</p>
          </div>
          <p className="mt-2 text-sm text-zinc-500">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function Titan10HomeClient({
  snapshot,
  health,
  setupWarnings,
  workspace,
  revenueHunt,
  leadRadarTop,
  leadRadarTablesReady,
  dailyHuntTasks,
  dailyHuntReady,
  dailyHuntDate,
  conversionGoal,
  moneyPlan,
  executions,
}: {
  snapshot: Titan10Snapshot;
  health: TitanSystemHealth;
  setupWarnings: Titan10Snapshot['setupWarnings'];
  workspace: 'today' | 'growth' | 'outreach' | 'reports';
  revenueHunt: Awaited<ReturnType<typeof loadRevenueHuntBundle>>;
  leadRadarTop: LeadRadarItem[];
  leadRadarTablesReady: boolean;
  dailyHuntTasks: Array<{ taskKey: string; label: string; completed: boolean; id: string | null }>;
  dailyHuntReady: boolean;
  dailyHuntDate: string;
  conversionGoal: ConversionGoalStats;
  moneyPlan: TodaysMoneyPlan;
  executions: TitanExecutionRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [huntMsg, setHuntMsg] = useState<string | null>(null);
  const [expErr, setExpErr] = useState<string | null>(null);
  const [hypothesis, setHypothesis] = useState('');
  const [actions, setActions] = useState('');
  const [expectedDollars, setExpectedDollars] = useState('1200');

  const sb = snapshot.scoreboard;

  const runHunt = () => {
    setHuntMsg(null);
    startTransition(async () => {
      const res = await runAcquisitionHuntAction();
      if (res.error) setHuntMsg(res.error);
      else {
        setHuntMsg(
          `Hunt complete${res.discovered != null ? ` · ${res.discovered} places found` : ''}${res.discoveryError ? ` · ${res.discoveryError}` : ''}`,
        );
      }
    });
  };

  const submitExperiment = (e: React.FormEvent) => {
    e.preventDefault();
    setExpErr(null);
    startTransition(async () => {
      const res = await createExperimentAction({
        hypothesis,
        actionsPlanned: actions,
        expectedRevenueCents: Math.round(Number(expectedDollars) * 100) || 0,
      });
      if (res.error) setExpErr(res.error);
      else {
        setHypothesis('');
        setActions('');
      }
    });
  };

  return (
    <div className="space-y-8">
      <header className="overflow-hidden rounded-[2rem] border border-emerald-500/20 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_35%),linear-gradient(135deg,rgba(9,9,11,0.98),rgba(0,0,0,0.98))] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.35)] sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-300">
              Titan · {TITAN_VERSION_LABEL}
              <span className="ml-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[8px] text-amber-200">{TITAN_PRODUCT_STAGE}</span>
            </p>
            <p className="mt-1 text-[10px] text-zinc-500">AI business operations layer — in active development, not a shipped product yet.</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{snapshot.ownerGreeting}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">{snapshot.mission}</p>
          </div>
          <Link href="/admin/titan/settings" className="w-fit rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-zinc-300 hover:border-emerald-500/30 hover:text-white">Settings & health</Link>
        </div>
        <nav className="mt-7 flex flex-wrap gap-2 border-t border-white/8 pt-5" aria-label="Titan workspace">
          {[
            { key: 'today', label: 'Today', icon: '📅' },
            { key: 'growth', label: 'Growth', icon: '📈' },
            { key: 'outreach', label: 'Outreach', icon: '✉️' },
            { key: 'reports', label: 'Reports', icon: '📊' },
          ].map((item) => (
            <Link key={item.key} href={`/admin/titan?workspace=${item.key}`} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] transition ${workspace === item.key ? 'bg-emerald-400 text-black shadow-[0_0_28px_rgba(52,211,153,0.2)]' : 'border border-white/8 bg-black/30 text-zinc-500 hover:text-white'}`}>
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <Link href="/admin/titan/opportunities" className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200 hover:text-white">
            <span aria-hidden>🎯</span>
            Opportunities
          </Link>
          <Link href="/admin/notifications" className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-amber-200 hover:text-white">
            <span aria-hidden>🔔</span>
            Activity
          </Link>
          <Link href="/admin/calendar" className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-sky-200 hover:text-white">
            <span aria-hidden>🗓️</span>
            Calendar
          </Link>
          <Link href="/admin/titan/lead-radar" className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200 hover:text-white">
            <span aria-hidden>📡</span>
            Lead Radar
          </Link>
          <Link href="/admin/titan/website-intelligence" className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-violet-200 hover:text-white">
            <span aria-hidden>🌐</span>
            Website Intelligence
          </Link>
          <Link href="/admin/titan/settings" className="inline-flex items-center gap-1.5 rounded-xl border border-white/8 bg-black/30 px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500 hover:text-white">
            <span aria-hidden>⚙️</span>
            Settings
          </Link>
        </nav>
      </header>

      {workspace !== 'today' && setupWarnings.length > 0 ? <TitanSetupBanner warnings={setupWarnings} /> : null}

      {workspace === 'today' ? (
        <TodaysMoneyPlanPanel plan={moneyPlan} />
      ) : null}

      {workspace === 'today' ? (
        <TitanConversionGoalPanel stats={conversionGoal} />
      ) : null}

      {workspace === 'today' ? (
        <TitanDailyHuntChecklist tasks={dailyHuntTasks} tablesReady={dailyHuntReady} taskDate={dailyHuntDate} />
      ) : null}

      {workspace === 'today' ? (
        <TitanRevenueHuntPanel
          huntTop5={revenueHunt.huntTop5}
          followUpsDue={revenueHunt.followUpsDue}
          recentEvents={revenueHunt.recentEvents}
          tablesReady={revenueHunt.tablesReady}
          totalCount={revenueHunt.opportunities.length}
        />
      ) : null}

      {workspace === 'today' ? (
        <TitanLeadRadarTodayPanel topItems={leadRadarTop} tablesReady={leadRadarTablesReady} />
      ) : null}

      {workspace === 'today' && snapshot.recovery.items.length > 0 ? (
      <Section
        title="Revenue Recovery"
        subtitle={`Recoverable today: ${money(snapshot.recovery.recoverableTodayCents)}`}
        icon={Wallet}
        accent="orange"
      >
        <ul className="space-y-2">
          {snapshot.recovery.items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex flex-wrap justify-between gap-2 rounded-xl border border-white/8 bg-black/40 px-4 py-3 hover:border-orange-500/30"
              >
                <div>
                  <p className="text-xs font-bold text-white">{item.title}</p>
                  <p className="text-[10px] text-zinc-500">{item.detail}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase text-orange-300">{item.nextAction}</p>
                </div>
                <p className="font-mono text-sm font-black text-emerald-300">{money(item.recoverableCents)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      ) : null}

      {workspace === 'today' && setupWarnings.length > 0 ? (
        <details className="rounded-2xl border border-white/6 bg-zinc-950/30">
          <summary className="cursor-pointer px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
            Setup / integrations ({setupWarnings.length})
          </summary>
          <div className="border-t border-white/6 p-4">
            <TitanSetupBanner warnings={setupWarnings} />
            <div className="mt-4">
              <TitanSystemHealthPanel health={health} />
            </div>
          </div>
        </details>
      ) : null}

      {workspace === 'outreach' ? <div id="proof"><TitanProofPanels snapshot={snapshot} /></div> : null}

      {workspace === 'reports' ? (
      <Section
        title="Titan Scoreboard"
        subtitle="If Titan cannot prove revenue impact, the feature is lower priority."
        icon={TrendingUp}
        accent="gold"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Revenue generated', value: money(sb.revenueGeneratedCents) },
            { label: 'Revenue recovered', value: money(sb.revenueRecoveredCents) },
            { label: 'Customers acquired', value: String(sb.customersAcquired) },
            { label: 'Partnerships acquired', value: String(sb.partnershipsAcquired) },
            { label: 'Follow-ups completed', value: String(sb.followUpsCompleted) },
            { label: 'Referrals generated', value: String(sb.referralsGenerated) },
            { label: 'Experiments completed', value: String(sb.experimentsCompleted) },
            { label: 'Period', value: sb.periodLabel },
          ].map((t) => (
            <div key={t.label} className="rounded-xl border border-white/8 bg-black/40 px-4 py-3">
              <p className="text-[10px] font-black uppercase text-zinc-600">{t.label}</p>
              <p className="mt-1 font-mono text-lg font-black text-white">{t.value}</p>
            </div>
          ))}
        </div>
      </Section>
      ) : null}

      {workspace === 'outreach' ? <TitanExecutionPanel rows={executions} /> : null}

      {workspace === 'growth' ? (
      <>
      <Section
        title={TITAN_ENGINES.acquisition}
        subtitle={`${snapshot.acquisition.opportunities.length} opportunities · ${money(snapshot.acquisition.totalPotentialCents)} potential`}
        icon={Crosshair}
        action={
          <button
            type="button"
            disabled={pending}
            onClick={runHunt}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} />
            Run Hunt Now
          </button>
        }
      >
        {huntMsg ? <p className="mb-3 text-xs text-emerald-300">{huntMsg}</p> : null}
        <p className="mb-4 text-[10px] text-zinc-600">On demand — click to hunt. No waiting for cron.</p>
        <ul className="space-y-2">
          {snapshot.acquisition.opportunities.slice(0, 8).map((o) => (
            <li key={o.id}>
              <Link href={o.href} className="block rounded-xl border border-white/8 bg-black/40 p-4 hover:border-emerald-500/30">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-bold text-white">{o.title}</p>
                  <p className="font-mono text-sm font-black text-emerald-300">{money(o.expectedRevenueCents)}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{o.reason}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-[10px]">
                  <span className="text-cyan-300">{o.nextAction}</span>
                  <span className="text-zinc-600">{o.confidencePercent}% confidence</span>
                  {o.timeToCloseDays != null ? <span className="text-zinc-600">~{o.timeToCloseDays}d to close</span> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
          <Link href="/admin/titan/opportunities" className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-400 hover:text-white">
            Open Opportunity Board <ArrowRight className="h-3 w-3" />
          </Link>
      </Section>

      <Section
        title={TITAN_ENGINES.partner}
        subtitle={`${snapshot.partners.partners.length} partners · ${money(snapshot.partners.totalAnnualPotentialCents)}/yr potential`}
        icon={Handshake}
        accent="violet"
      >
        <ul className="space-y-3">
          {snapshot.partners.partners.length === 0 ? (
            <li className="text-sm text-zinc-500">Run Hunt or add apartment/HOA targets in Command Center.</li>
          ) : (
            snapshot.partners.partners.slice(0, 5).map((p) => (
              <li key={p.id} className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="text-lg font-black text-white">{p.companyName}</p>
                    <p className="text-[10px] uppercase text-violet-300">{p.partnerType}</p>
                  </div>
                  <p className="font-mono text-lg font-black text-violet-200">{money(p.estimatedAnnualRevenueCents)}/yr</p>
                </div>
                <dl className="mt-3 grid gap-1 text-xs text-zinc-400 sm:grid-cols-2">
                  {p.contactName ? (
                    <div>
                      <dt className="text-zinc-600">Contact</dt>
                      <dd>{p.contactName}</dd>
                    </div>
                  ) : null}
                  {p.contactPhone ? (
                    <div>
                      <dt className="text-zinc-600">Phone</dt>
                      <dd>{p.contactPhone}</dd>
                    </div>
                  ) : null}
                  {p.partnershipReason ? (
                    <div className="sm:col-span-2">
                      <dt className="text-zinc-600">Why</dt>
                      <dd>{p.partnershipReason}</dd>
                    </div>
                  ) : null}
                </dl>
                <p className="mt-3 line-clamp-3 text-xs text-zinc-500">{p.outreachScript}</p>
                <p className="mt-2 text-[10px] font-bold uppercase text-violet-200">{p.nextAction}</p>
              </li>
            ))
          )}
        </ul>
      </Section>

      <Section title={TITAN_ENGINES.experiment} subtitle="Learn what actually grows the business" icon={FlaskConical} accent="cyan">
        {!snapshot.experiments.tablesReady ? (
          <p className="text-sm text-amber-200">Apply migration 000094 to enable experiments.</p>
        ) : (
          <>
            <form onSubmit={submitExperiment} className="mb-4 space-y-2 rounded-xl border border-white/8 bg-black/40 p-4">
              <input
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                placeholder="Hypothesis: Georgetown converts better than Round Rock"
                className="w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
                required
              />
              <input
                value={actions}
                onChange={(e) => setActions(e.target.value)}
                placeholder="Actions: 10 outreach attempts, 3 posts"
                className="w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
                required
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  value={expectedDollars}
                  onChange={(e) => setExpectedDollars(e.target.value)}
                  className="w-32 rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-cyan-500/20 px-4 py-2 text-[10px] font-black uppercase text-cyan-200"
                >
                  Start experiment
                </button>
              </div>
              {expErr ? <p className="text-xs text-red-300">{expErr}</p> : null}
            </form>
            <ul className="space-y-2">
              {[...snapshot.experiments.active, ...snapshot.experiments.completed.slice(0, 3)].map((ex) => (
                <li key={ex.id} className="rounded-xl border border-white/8 bg-black/40 px-4 py-3 text-xs">
                  <p className="font-bold text-white">{ex.hypothesis}</p>
                  <p className="mt-1 text-zinc-500">{ex.actionsPlanned}</p>
                  <p className="mt-1 font-mono text-emerald-300">Expected {money(ex.expectedRevenueCents)}</p>
                  {ex.status === 'active' ? (
                    <div className="mt-2 flex gap-2">
                      {(['pass', 'fail', 'inconclusive'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await completeExperimentAction(ex.id, r);
                            })
                          }
                          className="rounded border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-zinc-400 hover:text-white"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-cyan-300">Result: {ex.result}</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title={TITAN_ENGINES.opportunityGraph} subtitle={snapshot.graph.insight} icon={GitBranch}>
        {snapshot.graph.edges.length === 0 ? (
          <p className="text-sm text-zinc-500">Graph builds as customers, territories, and partners connect.</p>
        ) : (
          <ul className="space-y-2">
            {snapshot.graph.edges.map((e) => {
              const from = snapshot.graph.nodes.find((n) => n.id === e.fromId);
              const to = snapshot.graph.nodes.find((n) => n.id === e.toId);
              return (
                <li key={e.id} className="rounded-xl border border-white/8 bg-black/40 px-4 py-3 text-xs">
                  <span className="font-bold text-white">{from?.label ?? e.fromId}</span>
                  <span className="text-zinc-600"> → </span>
                  <span className="text-zinc-300">{to?.label ?? e.toId}</span>
                  <p className="mt-1 text-zinc-500">{e.relationship}</p>
                  <p className="font-mono text-emerald-300">{money(e.revenuePotentialCents)} potential</p>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Titan Memory" subtitle="What worked — Titan improves every month" icon={Target}>
        <ul className="space-y-2">
          {snapshot.memory.insights.map((m) => (
            <li key={m.id} className="rounded-xl border border-white/8 bg-black/40 px-4 py-3">
              <p className="text-[10px] font-black uppercase text-zinc-600">{m.category}</p>
              <p className="mt-1 text-sm font-bold text-white">{m.insight}</p>
              <p className="mt-1 text-xs text-zinc-500">{m.evidence}</p>
            </li>
          ))}
        </ul>
      </Section>
      </>
      ) : null}

      {workspace === 'reports' ? (
      <details className="rounded-2xl border border-white/6 bg-zinc-950/30">
        <summary className="cursor-pointer px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
          System health
        </summary>
        <div className="border-t border-white/6 p-4">
          <TitanSystemHealthPanel health={health} />
        </div>
      </details>
      ) : null}
    </div>
  );
}

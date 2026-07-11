'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, CheckCircle2, Sparkles, Trophy, Zap } from 'lucide-react';
import { markAchievementsSeenAction } from '@/app/(dashboard)/admin/goals/goals-actions';
import type { StaffAchievement } from '@/lib/goals-achievements';
import { goalProgressPct } from '@/lib/goals-achievements';

export type TeamGoalRow = {
  id: string;
  title: string;
  goal_type: string;
  target_value: number;
  current_value: number;
  unit: string;
  status: string;
  period_end: string | null;
  technician_id?: string | null;
};

function displayValue(unit: string, n: number) {
  if (unit === 'cents') return `$${(n / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return String(n);
}

const TIER_STYLES: Record<string, string> = {
  bronze: 'border-amber-700/40 bg-amber-900/20 text-amber-200',
  silver: 'border-zinc-400/30 bg-zinc-500/10 text-zinc-200',
  gold: 'border-gold/40 bg-gold/15 text-gold-soft',
  elite: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
  trophy: 'border-gold/50 bg-gold/20 text-gold-soft',
};

function AchievementBadge({ item, compact }: { item: StaffAchievement; compact?: boolean }) {
  const style = TIER_STYLES[item.tier ?? 'gold'] ?? TIER_STYLES.gold;
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${style} ${compact ? 'text-[9px]' : 'text-[10px]'} ${!item.seen_at ? 'ring-1 ring-gold/30' : ''}`}
      title={item.description ?? undefined}
    >
      <p className="font-black uppercase tracking-wide">{item.title}</p>
      {!compact && item.profile_name ? <p className="mt-0.5 text-zinc-500">{item.profile_name}</p> : null}
    </div>
  );
}

export function TeamGoalsScoreboard({
  goals,
  myAchievements = [],
  teamAchievements = [],
  profileId,
  weeklyGoalPct,
  weeklyGoalLabel,
  weeklyCurrentCents,
  weeklyTargetCents,
  showWeeklyHero = false,
  showGoalCards = true,
}: {
  goals: TeamGoalRow[];
  myAchievements?: StaffAchievement[];
  teamAchievements?: StaffAchievement[];
  profileId?: string;
  weeklyGoalPct?: number;
  weeklyGoalLabel?: string;
  weeklyCurrentCents?: number;
  weeklyTargetCents?: number | null;
  showWeeklyHero?: boolean;
  showGoalCards?: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const activeGoals = goals.filter((g) => g.status === 'active');
  const overallPct = useMemo(() => {
    if (activeGoals.length === 0) return 0;
    return Math.round(activeGoals.reduce((s, g) => s + goalProgressPct(g), 0) / activeGoals.length);
  }, [activeGoals]);

  const unseenIds = myAchievements.filter((a) => !a.seen_at).map((a) => a.id);

  return (
    <div className="space-y-5">
      {showWeeklyHero && weeklyTargetCents != null && weeklyTargetCents > 0 ? (
        <motion.div
          layout
          className="rounded-3xl border border-gold/35 bg-gradient-to-r from-black via-zinc-950 to-black p-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 h-32 w-32 bg-gold/10 rounded-full blur-[60px] pointer-events-none" />
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gold-soft flex items-center justify-center md:justify-start gap-1.5">
                <Zap className="h-3.5 w-3.5" /> Your weekly target
              </p>
              <h2 className="text-2xl font-black text-white uppercase tracking-tight">{weeklyGoalLabel ?? 'Weekly revenue'}</h2>
              <p className="text-xs text-zinc-400">
                <strong className="text-gold-soft">{weeklyGoalPct ?? 0}%</strong> —{' '}
                {displayValue('cents', weeklyCurrentCents ?? 0)} of {displayValue('cents', weeklyTargetCents)}
              </p>
              <div className="flex flex-wrap gap-2 pt-1 justify-center md:justify-start">
                {[25, 50, 75, 100].map((t) => (
                  <span
                    key={t}
                    className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                      (weeklyGoalPct ?? 0) >= t ? 'bg-gold/15 text-gold border-gold/30' : 'bg-white/5 text-zinc-500 border-white/5'
                    }`}
                  >
                    {t}% {t === 100 ? 'Elite' : t === 75 ? 'Gold' : t === 50 ? 'Silver' : 'Bronze'}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative h-24 w-24 shrink-0">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.05)" strokeWidth="6" fill="none" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="#d4af37"
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray="264"
                  strokeDashoffset={264 - (264 * (weeklyGoalPct ?? 0)) / 100}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-xl font-black text-white">{weeklyGoalPct ?? 0}%</span>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}

      {showGoalCards && activeGoals.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Team targets</p>
              <p className="text-sm text-zinc-400">Tap a goal for details · {overallPct}% overall</p>
            </div>
            <Link href="/admin/goals" className="text-[10px] font-bold uppercase text-gold-soft underline">
              Full scoreboard
            </Link>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-950">
            <div className="h-full rounded-full bg-gradient-to-r from-gold to-emerald-400 transition-all duration-500" style={{ width: `${overallPct}%` }} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {activeGoals.map((g) => {
              const pct = goalProgressPct(g);
              const open = expandedId === g.id;
              const dash = 283 - (283 * pct) / 100;
              return (
                <motion.button
                  key={g.id}
                  type="button"
                  layout
                  onClick={() => setExpandedId(open ? null : g.id)}
                  className={`rounded-2xl border p-4 text-left transition hover:border-gold/35 ${
                    open ? 'border-gold/40 bg-gold/5' : 'border-white/10 bg-zinc-950/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-black uppercase text-white">{g.title}</h3>
                      <p className="mt-0.5 text-[9px] font-mono uppercase text-zinc-500">{g.goal_type.replace(/_/g, ' ')}</p>
                    </div>
                    <div className="relative h-12 w-12 shrink-0">
                      <svg className="h-12 w-12 -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" stroke="rgba(255,255,255,0.06)" strokeWidth="10" fill="none" />
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          stroke="#f4d35e"
                          strokeWidth="10"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray="283"
                          strokeDashoffset={dash}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-black text-gold-soft">
                        {pct}%
                      </span>
                    </div>
                  </div>
                  <AnimatePresence>
                    {open ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-[10px] text-zinc-400">
                          <p>
                            Current <strong className="text-white">{displayValue(g.unit, g.current_value)}</strong> → Target{' '}
                            <strong className="text-gold-soft">{displayValue(g.unit, g.target_value)}</strong>
                          </p>
                          {g.period_end ? (
                            <p className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> Due {g.period_end.slice(0, 10)}
                            </p>
                          ) : null}
                          {g.status === 'completed' ? (
                            <p className="flex items-center gap-1 text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" /> Completed
                            </p>
                          ) : null}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        </div>
      ) : showGoalCards ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-black/30 p-8 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-zinc-600" />
          <p className="mt-3 text-sm text-zinc-400">No team goals yet — your owner sets targets in Admin → Goals.</p>
          <Link href="/admin/goals" className="mt-3 inline-block text-[10px] font-black uppercase text-gold-soft underline">
            View goals hub
          </Link>
        </div>
      ) : null}

      {(myAchievements.length > 0 || teamAchievements.length > 0) && (
        <div className="rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/5 to-black p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5" /> Awards
            </p>
            {unseenIds.length > 0 && profileId ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await markAchievementsSeenAction(unseenIds);
                  })
                }
                className="text-[9px] font-black uppercase text-emerald-300 hover:underline disabled:opacity-50"
              >
                Mark {unseenIds.length} new as seen
              </button>
            ) : null}
          </div>
          {myAchievements.length > 0 ? (
            <div className="mt-3">
              <p className="text-[9px] font-bold uppercase text-zinc-500 mb-2">Your badges</p>
              <div className="flex flex-wrap gap-2">
                {myAchievements.slice(0, 8).map((a) => (
                  <AchievementBadge key={a.id} item={a} compact />
                ))}
              </div>
            </div>
          ) : null}
          {teamAchievements.length > 0 ? (
            <div className="mt-4">
              <p className="text-[9px] font-bold uppercase text-zinc-500 mb-2">Team wins</p>
              <div className="flex flex-wrap gap-2">
                {teamAchievements.slice(0, 6).map((a) => (
                  <AchievementBadge key={a.id} item={a} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

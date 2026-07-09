'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Calendar, GraduationCap, Radar, RefreshCw, Send, Sparkles, Target, Zap } from 'lucide-react';
import type { ExecutiveBriefingSnapshot } from '@/lib/titan/executive-briefing';
import { runAcquisitionHuntAction } from '@/app/(dashboard)/admin/titan/titan-1-actions';
import { syncFollowUpsNowAction } from '@/app/(dashboard)/admin/follow-ups/follow-up-actions';
import { GlassCard, SectionEyebrow } from '@/components/ui/premium';

export function TitanPowerstonePanel({ briefing }: { briefing: ExecutiveBriefingSnapshot }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const topMoneyAction = briefing.dailyActionPlan.fastestMoneyMoves[0];

  const actions = [
    {
      icon: Send,
      label: 'Reply to messages',
      detail: briefing.unreadActivity > 0 ? `${briefing.unreadActivity} unread` : 'Inbox clear',
      href: '/admin/messages',
      tone: 'text-cyan-300',
    },
    {
      icon: Target,
      label: 'Run revenue hunt',
      detail: 'Scan opportunities now',
      onClick: () => {
        startTransition(async () => {
          await runAcquisitionHuntAction();
          router.refresh();
        });
      },
      tone: 'text-emerald-300',
    },
    {
      icon: RefreshCw,
      label: 'Sync follow-ups',
      detail: 'Queue stale customer texts',
      onClick: () => {
        startTransition(async () => {
          await syncFollowUpsNowAction();
          router.refresh();
        });
      },
      tone: 'text-sky-300',
    },
    {
      icon: Radar,
      label: 'Lead radar',
      detail: 'Prospects & outreach',
      href: '/admin/titan/lead-radar',
      tone: 'text-violet-300',
    },
    {
      icon: Calendar,
      label: "Today's calendar",
      detail: briefing.scheduleLabel,
      href: '/admin/calendar',
      tone: 'text-gold-soft',
    },
    {
      icon: Zap,
      label: 'Close the gap',
      detail: topMoneyAction ? topMoneyAction.title.slice(0, 42) : briefing.revenueGapLabel,
      onClick: () => {
        document.getElementById('daily-action-plan')?.scrollIntoView({ behavior: 'smooth' });
      },
      tone: 'text-rose-300',
    },
    {
      icon: GraduationCap,
      label: 'Business Academy',
      detail: 'Videos, models, playbooks',
      href: '/admin/academy',
      tone: 'text-amber-200',
    },
  ];

  return (
    <GlassCard className="border-gold/25 bg-gradient-to-br from-gold/8 via-black to-zinc-950">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-gold-soft" />
        <SectionEyebrow>Titan Powerstone</SectionEyebrow>
      </div>
      <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
        One-tap loops — hunt, sync follow-ups, or jump to today&apos;s top money action.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {actions.map((action) => {
          const Icon = action.icon;
          if (action.onClick) {
            return (
              <button
                key={action.label}
                type="button"
                disabled={pending}
                onClick={action.onClick}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/50 p-3 text-left transition hover:border-gold/35 hover:bg-black/70 disabled:opacity-60"
              >
                <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${action.tone}`} />
                <span>
                  <span className="block text-[11px] font-black uppercase text-white">{pending ? 'Running…' : action.label}</span>
                  <span className="mt-0.5 block text-[10px] text-zinc-500">{action.detail}</span>
                </span>
              </button>
            );
          }
          return (
            <Link
              key={action.label}
              href={action.href!}
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/50 p-3 transition hover:border-gold/35 hover:bg-black/70"
            >
              <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${action.tone}`} />
              <span>
                <span className="block text-[11px] font-black uppercase text-white">{action.label}</span>
                <span className="mt-0.5 block text-[10px] text-zinc-500">{action.detail}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </GlassCard>
  );
}

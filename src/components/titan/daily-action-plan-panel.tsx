'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ChevronRight, Send, X, Eye } from 'lucide-react';
import type { DailyExecutableAction } from '@/lib/titan/daily-action-plan';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';
import { buildToneVariants } from '@/lib/outbound-message-tones';
import { sendPreviewedSmsAction } from '@/app/(dashboard)/admin/outbound-message-actions';
import { markOpportunityStatusAction } from '@/app/(dashboard)/admin/titan/opportunity-actions';
import {
  dismissDailyActionAction,
  markDailyActionSentAction,
} from '@/app/(dashboard)/admin/daily-action-actions';

function ActionCard({ action }: { action: DailyExecutableAction }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { openPreview } = useOutboundPreview();

  const onPreview = () => {
    if (!action.contactPhone && !action.messageScript) return;
    const tones = buildToneVariants(action.messageScript);
    openPreview({
      title: action.title,
      channel: 'sms',
      recipient: action.contactPhone ?? '',
      body: tones.professional,
      toneVariants: tones,
      contextLabel: action.involvedNames,
      onSend: async (final) => {
        if (!action.contactPhone) return { error: 'No phone on file.' };
        const res = await sendPreviewedSmsAction({
          to: action.contactPhone,
          body: final.body,
          kind: `daily_${action.actionType}`,
          entityType: action.entityType,
          entityId: action.entityId,
        });
        if (!res.error) {
          if (action.entityType === 'opportunity' && action.entityId) {
            await markOpportunityStatusAction(action.entityId, 'contacted');
          }
          if (!action.id.startsWith('draft-')) {
            await markDailyActionSentAction(action.id, action.actionType === 'review' ? 'review' : 'sms');
          }
          router.refresh();
        }
        return res;
      },
    });
  };

  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-wider text-gold-soft">{action.actionType.replace('_', ' ')}</p>
          <h3 className="mt-1 text-sm font-black text-foreground">{action.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{action.involvedNames}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-black text-emerald-600 dark:text-emerald-300">{action.expectedValueLabel}</p>
          <p className="text-[10px] text-muted-foreground">{action.confidence}% · {action.confidenceLabel}</p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{action.reason}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {action.canSend ? (
          <button
            type="button"
            onClick={onPreview}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/20"
          >
            <Eye className="h-3 w-3" /> Preview
          </button>
        ) : null}
        {action.canSend ? (
          <button
            type="button"
            onClick={onPreview}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg bg-gold px-2.5 py-1.5 text-[10px] font-black uppercase text-black hover:brightness-110"
          >
            <Send className="h-3 w-3" /> Send
          </button>
        ) : null}
        <Link
          href={action.href}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-black uppercase text-foreground hover:border-gold/25"
        >
          Open <ChevronRight className="h-3 w-3" />
        </Link>
        {!action.id.startsWith('draft-') ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await dismissDailyActionAction(action.id);
                router.refresh();
              })
            }
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-black uppercase text-muted-foreground hover:border-rose-500/30 hover:text-rose-400"
          >
            <X className="h-3 w-3" /> Dismiss
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function DailyActionPlanPanel({ actions }: { actions: DailyExecutableAction[] }) {
  if (actions.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Daily action plan</p>
        <p className="mt-2 text-sm text-muted-foreground">No pending actions — inbox and schedule look clear.</p>
      </section>
    );
  }

  return (
    <section id="daily-action-plan" className="space-y-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">What should I do today?</p>
        <h2 className="mt-1 text-lg font-black text-foreground">Daily action plan</h2>
        <p className="mt-1 text-xs text-muted-foreground">Executable moves with expected value — preview, send, or dismiss.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {actions.map((a) => (
          <ActionCard key={a.id} action={a} />
        ))}
      </div>
    </section>
  );
}

export function TodaysMoneyMovesPanel({
  revenueTargetLabel,
  revenueGapLabel,
  moves,
}: {
  revenueTargetLabel: string;
  revenueGapLabel: string;
  moves: DailyExecutableAction[];
}) {
  return (
    <section className="rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/8 via-card to-card p-5">
      <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Today&apos;s money moves</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[9px] uppercase text-muted-foreground">Target</p>
          <p className="text-xl font-black text-foreground">{revenueTargetLabel}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase text-muted-foreground">Gap</p>
          <p className="text-xl font-black text-rose-600 dark:text-rose-300">{revenueGapLabel}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase text-muted-foreground">Fastest closes</p>
          <p className="text-xl font-black text-emerald-600 dark:text-emerald-300">{moves.length} ready</p>
        </div>
      </div>
      {moves.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {moves.map((m) => (
            <MoneyMoveRow key={m.id} move={m} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function MoneyMoveRow({ move }: { move: DailyExecutableAction }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { openPreview } = useOutboundPreview();

  const onSend = () => {
    if (!move.contactPhone && !move.messageScript) return;
    const tones = buildToneVariants(move.messageScript);
    openPreview({
      title: move.title,
      channel: 'sms',
      recipient: move.contactPhone ?? '',
      body: tones.professional,
      toneVariants: tones,
      contextLabel: move.involvedNames,
      onSend: async (final) => {
        if (!move.contactPhone) return { error: 'No phone on file.' };
        const res = await sendPreviewedSmsAction({
          to: move.contactPhone,
          body: final.body,
          kind: `daily_${move.actionType}`,
          entityType: move.entityType,
          entityId: move.entityId,
        });
        if (!res.error && !move.id.startsWith('draft-')) {
          await markDailyActionSentAction(move.id, move.actionType === 'review' ? 'review' : 'sms');
          router.refresh();
        }
        return res;
      },
    });
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs">
      <span className="font-semibold text-foreground">{move.title}</span>
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-gold-soft">{move.expectedValueLabel}</span>
        {move.canSend ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(onSend)}
            className="rounded-lg bg-gold px-2 py-1 text-[9px] font-black uppercase text-black"
          >
            Send
          </button>
        ) : null}
      </div>
    </li>
  );
}

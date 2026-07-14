'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { AlarmClock, ChevronRight, Eye, RefreshCw, Send, X } from 'lucide-react';
import type { DailyExecutableAction } from '@/lib/titan/daily-action-plan';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';
import { buildToneVariants } from '@/lib/outbound-message-tones';
import { sendPreviewedEmailAction, sendPreviewedSmsAction } from '@/app/(dashboard)/admin/outbound-message-actions';
import { markOpportunityStatusAction } from '@/app/(dashboard)/admin/titan/opportunity-actions';
import {
  dismissDailyActionAction,
  markDailyActionSentAction,
  regenerateDailyActionPlanAction,
  snoozeDailyActionAction,
} from '@/app/(dashboard)/admin/daily-action-actions';

function actionChannels(action: DailyExecutableAction): Array<'sms' | 'email'> {
  const channels: Array<'sms' | 'email'> = [];
  if (action.contactPhone) channels.push('sms');
  if (action.contactEmail) channels.push('email');
  return channels;
}

function defaultChannel(action: DailyExecutableAction): 'sms' | 'email' {
  return action.contactPhone ? 'sms' : 'email';
}

function defaultRecipient(action: DailyExecutableAction, channel: 'sms' | 'email') {
  return channel === 'sms' ? action.contactPhone ?? '' : action.contactEmail ?? '';
}

function openActionModal(
  action: DailyExecutableAction,
  openPreview: ReturnType<typeof useOutboundPreview>['openPreview'],
  opts: { sendLabel?: string; onSuccess?: () => void },
) {
  const channel = defaultChannel(action);
  const channels = actionChannels(action);
  const tones = buildToneVariants(action.messageScript);
  const recipient = defaultRecipient(action, channel);

  openPreview({
    title: action.title,
    channel,
    channelOptions: channels.length > 1 ? channels : undefined,
    recipient,
    body: tones.professional,
    subject: action.actionType === 'review' ? 'How did we do? — Gloss Boss ATX' : 'Gloss Boss ATX',
    toneVariants: tones,
    contextLabel: `${action.involvedNames} · ${action.expectedValueLabel}`,
    kind: `daily_${action.actionType}`,
    entityType: action.entityType,
    entityId: action.entityId,
    opportunityId: action.entityType === 'opportunity' ? action.entityId : undefined,
    appointmentId: action.entityType === 'appointment' ? action.entityId : undefined,
    sendLabel: opts.sendLabel,
    onSend: async (final) => {
      const to =
        final.channel === 'sms'
          ? action.contactPhone ?? ''
          : action.contactEmail ?? '';
      if (!to) return { error: final.channel === 'sms' ? 'No phone on file.' : 'No email on file.' };

      const res =
        final.channel === 'sms'
          ? await sendPreviewedSmsAction({
              to,
              body: final.body,
              kind: `daily_${action.actionType}`,
              entityType: action.entityType,
              entityId: action.entityId,
              appointmentId: action.entityType === 'appointment' ? action.entityId : undefined,
            })
          : await sendPreviewedEmailAction({
              to,
              subject: final.subject ?? 'Gloss Boss ATX',
              body: final.body,
              kind: `daily_${action.actionType}`,
              entityType: action.entityType,
              entityId: action.entityId,
              appointmentId: action.entityType === 'appointment' ? action.entityId : undefined,
            });

      if (!res.error) {
        if (action.entityType === 'opportunity' && action.entityId) {
          await markOpportunityStatusAction(action.entityId, 'contacted');
        }
        if (!action.id.startsWith('draft-')) {
          await markDailyActionSentAction(action.id, action.actionType === 'review' ? 'review' : final.channel);
        }
        opts.onSuccess?.();
      }
      return res;
    },
  });
}

export function ActionCard({ action }: { action: DailyExecutableAction }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { openPreview } = useOutboundPreview();

  const onPreview = () => {
    if (!action.messageScript) return;
    openActionModal(action, openPreview, {
      sendLabel: 'Send now',
      onSuccess: () => router.refresh(),
    });
  };

  const onSend = () => {
    if (!action.canSend) return;
    openActionModal(action, openPreview, {
      sendLabel: 'Send now',
      onSuccess: () => router.refresh(),
    });
  };

  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-wider text-gold-soft">{action.actionType.replace('_', ' ')}</p>
          <h3 className="mt-1 text-sm font-black text-foreground">{action.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{action.involvedNames}</p>
          {action.carriedOver ? (
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-300">
              Carried over{action.actionDate ? ` · ${action.actionDate}` : ''}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-sm font-black text-emerald-600 dark:text-emerald-300">{action.expectedValueLabel}</p>
          <p className="text-[10px] text-muted-foreground">{action.confidence}% · {action.confidenceLabel}</p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{action.reason}</p>
      {action.valueExplanation ? (
        <p className="mt-1 text-[10px] text-zinc-500">{action.valueExplanation}</p>
      ) : null}
      {(action.contactPhone || action.contactEmail) && (
        <p className="mt-2 text-[10px] text-zinc-500">
          {action.contactPhone ? `SMS: ${action.contactPhone}` : null}
          {action.contactPhone && action.contactEmail ? ' · ' : null}
          {action.contactEmail ? `Email: ${action.contactEmail}` : null}
        </p>
      )}
      {!action.canSend && action.sendBlocker ? (
        <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-200">
          {action.sendBlocker}
        </p>
      ) : null}
      {!action.canSend ? (
        <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-300">
          Manual action required
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {action.messageScript ? (
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
            onClick={onSend}
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
            onClick={() => startTransition(async () => { await snoozeDailyActionAction(action.id, 2); router.refresh(); })}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-black uppercase text-muted-foreground hover:border-amber-500/30 hover:text-amber-400"
          >
            <AlarmClock className="h-3 w-3" /> Snooze 2h
          </button>
        ) : null}
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

function formatGeneratedAt(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export function DailyActionPlanPanel({
  actions,
  lastGeneratedAt,
  excludeIds,
}: {
  actions: DailyExecutableAction[];
  lastGeneratedAt?: string | null;
  /** Skip actions already shown in Highest ROI (avoids triple duplication). */
  excludeIds?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const skip = new Set(excludeIds ?? []);
  const visible = actions.filter((a) => !skip.has(a.id));
  const generatedLabel = formatGeneratedAt(lastGeneratedAt);

  const onRefresh = () => {
    startTransition(async () => {
      await regenerateDailyActionPlanAction();
      router.refresh();
    });
  };

  if (visible.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Daily action plan</p>
            <p className="mt-2 text-sm text-muted-foreground">No pending actions — inbox and schedule look clear.</p>
            {generatedLabel ? <p className="mt-1 text-[10px] text-muted-foreground">Last generated {generatedLabel}</p> : null}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-black uppercase text-foreground hover:border-gold/30 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${pending ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </section>
    );
  }

  return (
    <section id="daily-action-plan" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">What should I do today?</p>
          <h2 className="mt-1 text-lg font-black text-foreground">Daily action plan</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Preview, send, or schedule each move — SMS or email when contact info is available.
          </p>
          {generatedLabel ? <p className="mt-1 text-[10px] text-muted-foreground">Last generated {generatedLabel}</p> : null}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-black uppercase text-foreground hover:border-gold/30 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${pending ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map((a) => (
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
    if (!move.canSend) return;
    openActionModal(move, openPreview, {
      onSuccess: () => router.refresh(),
    });
  };

  return (
    <li className="rounded-xl border border-border bg-background/60 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{move.title}</span>
        <span className="shrink-0 font-mono text-gold-soft">{move.expectedValueLabel}</span>
      </div>
      {move.carriedOver ? (
        <p className="mt-1 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-300">Carried over</p>
      ) : null}
      {move.valueExplanation ? <p className="mt-1 text-[10px] text-zinc-500">{move.valueExplanation}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {move.canSend ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(onSend)}
              className="inline-flex items-center gap-1 rounded-lg bg-gold px-2 py-1 text-[9px] font-black uppercase text-black"
            >
              <Send className="h-3 w-3" /> Send
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() => {
                  openActionModal(move, openPreview, { sendLabel: 'Preview', onSuccess: () => router.refresh() });
                })
              }
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[9px] font-black uppercase text-muted-foreground"
            >
              <Eye className="h-3 w-3" /> Preview
            </button>
          </>
        ) : (
          <Link
            href={move.href}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[9px] font-black uppercase text-muted-foreground"
          >
            Open <ChevronRight className="h-3 w-3" />
          </Link>
        )}
        {!move.id.startsWith('draft-') ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => { await snoozeDailyActionAction(move.id, 2); router.refresh(); })}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[9px] font-black uppercase text-muted-foreground hover:text-amber-400"
          >
            <AlarmClock className="h-3 w-3" /> Snooze
          </button>
        ) : null}
        {!move.id.startsWith('draft-') ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await dismissDailyActionAction(move.id);
                router.refresh();
              })
            }
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[9px] font-black uppercase text-muted-foreground hover:border-rose-500/30 hover:text-rose-400"
          >
            <X className="h-3 w-3" /> Dismiss
          </button>
        ) : null}
      </div>
    </li>
  );
}

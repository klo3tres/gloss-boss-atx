import type { TitanBriefing } from '@/lib/titan-briefing';
import { buildRevenueMissionFromBriefing } from '@/lib/titan/revenue-mission';
import type { OutreachKit } from '@/lib/titan/engines/outreach';

export type RealDailyAction = {
  id: string;
  title: string;
  reason: string;
  potentialCents: number;
  href: string;
  recipient: string;
  recipientPhone: string | null;
  recipientEmail: string | null;
  messagePreview: string;
  outreach?: OutreachKit;
  source: string;
};

const ALLOWED_IDS = new Set([
  'follow-ups',
  'estimates',
  'exceptions',
  'first-responder',
  'revenue-gap',
]);

/** Only real revenue actions — no filler. */
export function buildRealDailyActions(briefing: TitanBriefing, outreachKits: OutreachKit[]): RealDailyAction[] {
  const mission = buildRevenueMissionFromBriefing(briefing);
  const avg = Math.max(briefing.insights.avgJobCents, 15000);

  const actions = briefing.recommendations
    .filter((a) => ALLOWED_IDS.has(a.id))
    .filter((a) => a.priority === 'high' || (a.impactCents ?? 0) >= avg * 0.5)
    .map((a, i) => {
      const kit = outreachKits[i];
      const potential = a.impactCents ?? (a.id === 'estimates' ? avg : Math.round(avg * 0.7));
      return {
        id: `real-${a.id}`,
        title: a.title,
        reason: a.detail,
        potentialCents: potential,
        href: a.href,
        recipient: a.id === 'follow-ups' ? 'Customer follow-up' : a.id === 'estimates' ? 'Estimate prospect' : 'Target',
        recipientPhone: null,
        recipientEmail: null,
        messagePreview: kit?.sms ?? `Hi — following up from Gloss Boss ATX. ${a.detail}`,
        outreach: kit,
        source: a.id,
      } satisfies RealDailyAction;
    })
    .filter((a) => a.potentialCents > 0)
    .sort((a, b) => b.potentialCents - a.potentialCents)
    .slice(0, 3);

  if (actions.length > 0) return actions;

  // Fallback to mission plan only if high-confidence
  return mission.planActions
    .filter((a) => a.potentialCents >= avg * 0.4)
    .slice(0, 3)
    .map((a, i) => ({
      id: `plan-${a.rank}`,
      title: a.title,
      reason: a.detail || a.nextAction,
      potentialCents: a.potentialCents,
      href: a.href,
      recipient: 'See record',
      recipientPhone: null,
      recipientEmail: null,
      messagePreview: outreachKits[i]?.sms ?? a.nextAction,
      outreach: outreachKits[i],
      source: 'mission',
    }));
}

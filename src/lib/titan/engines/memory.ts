import type { TitanBriefing } from '@/lib/titan-briefing';
import type { MemoryEngine, MemoryInsight } from '@/lib/titan/engines/types';

export function buildMemoryEngine(briefing: TitanBriefing): MemoryEngine {
  const insights: MemoryInsight[] = [];
  const learning = briefing.opportunityScanner.learning;

  if (learning.winRatePercent > 0 || learning.won + learning.lost > 0) {
    insights.push({
      id: 'opp-win-rate',
      category: 'Outreach',
      insight: `${learning.winRatePercent}% win rate on scored opportunities`,
      evidence: learning.topWinType ? `Best wins: ${learning.topWinType}` : 'Track won/lost in Opportunity Scanner',
    });
  }

  if (learning.topLostReason) {
    insights.push({
      id: 'opp-lost',
      category: 'Outreach',
      insight: `Top lost reason: ${learning.topLostReason}`,
      evidence: 'Titan adjusts scoring from your outcomes',
    });
  }

  if (briefing.growth.content.topPost) {
    const p = briefing.growth.content.topPost;
    insights.push({
      id: 'content-top',
      category: 'Content',
      insight: `"${p.title}" drove ${p.leadsCount} leads`,
      evidence: `${p.views} views · $${(p.revenueCents / 100).toFixed(0)} attributed revenue`,
    });
  }

  if (briefing.insights.topService) {
    insights.push({
      id: 'top-service',
      category: 'Services',
      insight: `${briefing.insights.topService.label} is the top seller this month`,
      evidence: `$${(briefing.insights.topService.revenueCents / 100).toFixed(0)} collected MTD`,
    });
  }

  const topTerritory = briefing.territory.territories.sort((a, b) => b.jobs - a.jobs)[0];
  if (topTerritory) {
    insights.push({
      id: 'territory',
      category: 'Neighborhoods',
      insight: `${topTerritory.label} converts best (${topTerritory.closeRatePercent}% close)`,
      evidence: `${topTerritory.jobs} jobs · avg ${topTerritory.avgTicketCents / 100} ticket`,
    });
  }

  if (briefing.roi.followUpsSent > 0) {
    insights.push({
      id: 'follow-ups',
      category: 'Recovery',
      insight: `${briefing.roi.followUpsSent} follow-ups sent this period`,
      evidence: `~$${(briefing.roi.revenueRecoveredCents / 100).toFixed(0)} attributed recovery`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'seed',
      category: 'Memory',
      insight: 'Titan memory builds as you win opportunities, send outreach, and close jobs',
      evidence: 'Complete hunts, follow-ups, and experiments to train Titan',
    });
  }

  return { insights };
}

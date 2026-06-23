import type { TitanBriefing } from '@/lib/titan-briefing';
import { buildRevenueMissionFromBriefing } from '@/lib/titan/revenue-mission';
import type { WeeklyMission, WeeklyMissionAction } from '@/lib/titan/engines/types';

function isMondayChicago(): boolean {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(new Date());
  return day === 'Mon';
}

export function buildWeeklyMission(briefing: TitanBriefing): WeeklyMission {
  const mission = buildRevenueMissionFromBriefing(briefing);
  const topActions: WeeklyMissionAction[] = mission.planActions.slice(0, 5).map((a) => ({
    rank: a.rank,
    title: a.title,
    expectedRevenueCents: a.potentialCents,
    probabilityPercent: a.confidencePercent,
    nextAction: a.nextAction,
    href: a.href,
  }));

  let recommendedFocus = 'Acquisition — run hunt and work top opportunities';
  if (briefing.insights.followUpsDue > 3) {
    recommendedFocus = 'Recovery — clear overdue follow-ups first';
  } else if (briefing.growth.radar.prospects.some((p) => ['apartment_complex', 'hoa'].includes(p.prospectType))) {
    recommendedFocus = 'Partnerships — one apartment deal beats dozens of one-off leads';
  } else if (briefing.insights.openEstimates > 2) {
    recommendedFocus = 'Pipeline — close open estimates waiting on approval';
  }

  return {
    isWeeklyFocus: isMondayChicago(),
    potentialRevenueCents: mission.revenueAvailableTodayCents,
    topActions,
    recommendedFocus,
  };
}

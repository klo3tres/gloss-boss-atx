import type { SupabaseClient } from '@supabase/supabase-js';
import { loadTitanBriefing } from '@/lib/titan-briefing';
import { TITAN_MISSION } from '@/lib/titan/branding';
import { buildAcquisitionEngine } from '@/lib/titan/engines/acquisition';
import { buildPartnerEngine } from '@/lib/titan/engines/partner';
import { buildRecoveryEngine } from '@/lib/titan/engines/recovery';
import { loadExperimentEngine } from '@/lib/titan/engines/experiment';
import { buildOpportunityGraph } from '@/lib/titan/engines/graph';
import { buildMemoryEngine } from '@/lib/titan/engines/memory';
import { buildWeeklyMission } from '@/lib/titan/engines/weekly-mission';
import { loadTitanScoreboard } from '@/lib/titan/engines/scoreboard';
import { buildGoalEngine } from '@/lib/titan/engines/goal';
import { buildOutreachEngineFromBriefing } from '@/lib/titan/engines/outreach';
import { loadReferralEngine } from '@/lib/titan/engines/referral';
import { buildTerritoryDomination } from '@/lib/titan/engines/territory-domination';
import { buildContentPerformanceEngine } from '@/lib/titan/engines/content-performance';
import { buildFleetEngine } from '@/lib/titan/engines/fleet';
import { buildRevenueForecast } from '@/lib/titan/engines/revenue-forecast';
import { ensureDailyMission, loadDeals, syncDealsFromProspects } from '@/lib/titan/engines/daily-autonomy';
import { loadAttributionProof } from '@/lib/titan/engines/attribution';
import { buildAcquisitionSourcesBoard } from '@/lib/titan/engines/acquisition-sources';
import { loadLearningInsights } from '@/lib/titan/engines/outcome-tracking';
import { loadTouchSchedule } from '@/lib/titan/engines/touch-schedule';
import { loadJobCloseouts } from '@/lib/titan/engines/job-closeout';
import { loadOffers } from '@/lib/titan/engines/offer-builder';
import { loadTitanWorkspace } from '@/lib/titan/workspace';
import { buildDemoSnapshot } from '@/lib/titan/demo-snapshot';
import type { OutreachKit } from '@/lib/titan/engines/outreach';
import type { Titan10Snapshot } from '@/lib/titan/engines/types';

export type { Titan10Snapshot } from '@/lib/titan/engines/types';

export async function loadTitan10Snapshot(
  admin: SupabaseClient,
  ownerName?: string | null,
): Promise<Titan10Snapshot> {
  const briefing = await loadTitanBriefing(admin, ownerName);
  const weeklyMission = buildWeeklyMission(briefing);

  const [experiments, scoreboard, referral] = await Promise.all([
    loadExperimentEngine(admin),
    loadTitanScoreboard(admin, briefing),
    loadReferralEngine(admin),
  ]);

  const outreach = buildOutreachEngineFromBriefing({
    prospects: briefing.growth.radar.prospects,
    opportunities: briefing.opportunityScanner.feed,
    referralNames: referral.candidates.slice(0, 3).map((c) => ({
      customerName: c.customerName,
    })),
  });

  const outreachByTitle = new Map<string, OutreachKit>();
  weeklyMission.topActions.forEach((action, i) => {
    const kit = outreach.kits[i];
    if (kit) outreachByTitle.set(action.title, kit);
  });

  const [dailyAutonomy, deals, attribution, acquisitionSources, learning, touchSchedule, jobCloseouts, offers, workspace] =
    await Promise.all([
    ensureDailyMission(admin, {
      potentialCents: weeklyMission.potentialRevenueCents,
      actions: weeklyMission.topActions,
      outreachByTitle,
    }),
    (async () => {
      await syncDealsFromProspects(admin);
      return loadDeals(admin);
    })(),
    loadAttributionProof(admin),
    buildAcquisitionSourcesBoard(admin),
    loadLearningInsights(admin),
    loadTouchSchedule(admin),
    loadJobCloseouts(admin),
    loadOffers(admin),
    loadTitanWorkspace(admin),
  ]);

  const name = briefing.ownerName?.split(' ')[0] ?? 'there';

  const workspaceMeta = {
    demoMode: workspace.demoMode,
    onboardingStep: workspace.onboardingStep,
    onboardingComplete: Boolean(workspace.onboardingCompletedAt),
    subscriptionTier: workspace.subscriptionTier,
    subscriptionStatus: workspace.subscriptionStatus,
  };

  const snapshot: Titan10Snapshot = {
    mission: TITAN_MISSION,
    ownerGreeting: `${briefing.greeting}, ${name}`,
    setupWarnings: briefing.setupWarnings,
    scoreboard,
    dailyAutonomy,
    goal: buildGoalEngine(briefing),
    revenueForecast: buildRevenueForecast(briefing),
    outreach,
    referral,
    territory: buildTerritoryDomination(briefing.territory),
    content: buildContentPerformanceEngine(briefing),
    fleet: buildFleetEngine(briefing.growth.radar.prospects),
    deals,
    acquisition: buildAcquisitionEngine(briefing),
    partners: buildPartnerEngine(briefing),
    recovery: buildRecoveryEngine(briefing.intelligence.revenueLeaks),
    experiments,
    graph: buildOpportunityGraph(briefing),
    memory: buildMemoryEngine(briefing),
    weeklyMission,
    attribution,
    acquisitionSources,
    learning: { insights: learning },
    touchSchedule,
    jobCloseouts,
    offers,
    workspaceMeta,
  };

  if (workspace.demoMode) {
    return buildDemoSnapshot(snapshot);
  }

  return snapshot;
}

/** Titan 1.0 — every insight must prove revenue impact. */

export type TitanRevenueCard = {
  id: string;
  title: string;
  expectedRevenueCents: number;
  confidencePercent: number;
  nextAction: string;
  reason: string;
  timeToCloseDays: number | null;
  href: string;
  outreachRecommendation?: string;
};

export type PartnerCard = {
  id: string;
  companyName: string;
  partnerType: string;
  estimatedAnnualRevenueCents: number;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  decisionMakerTitle: string | null;
  notes: string | null;
  acquisitionSource: string | null;
  outreachScript: string;
  partnershipReason: string | null;
  nextAction: string;
  confidencePercent: number;
  href: string;
};

export type RecoveryItem = {
  id: string;
  category: string;
  title: string;
  detail: string;
  recoverableCents: number;
  count: number;
  nextAction: string;
  href: string;
};

export type TitanExperiment = {
  id: string;
  hypothesis: string;
  actionsPlanned: string;
  expectedRevenueCents: number;
  testLengthDays: number;
  status: 'active' | 'completed' | 'cancelled';
  result: 'pass' | 'fail' | 'inconclusive' | null;
  resultNotes: string | null;
  startedAt: string;
  endsAt: string | null;
};

export type GraphNode = {
  id: string;
  label: string;
  kind: 'customer' | 'territory' | 'referral' | 'employer' | 'partner' | 'hoa';
};

export type GraphEdge = {
  id: string;
  fromId: string;
  toId: string;
  relationship: string;
  revenuePotentialCents: number;
};

export type MemoryInsight = {
  id: string;
  category: string;
  insight: string;
  evidence: string;
};

export type WeeklyMissionAction = {
  rank: number;
  title: string;
  expectedRevenueCents: number;
  probabilityPercent: number;
  nextAction: string;
  href: string;
};

export type TitanScoreboard = {
  periodLabel: string;
  revenueGeneratedCents: number;
  revenueRecoveredCents: number;
  customersAcquired: number;
  partnershipsAcquired: number;
  followUpsCompleted: number;
  referralsGenerated: number;
  experimentsCompleted: number;
};

export type AcquisitionEngine = {
  tablesReady: boolean;
  opportunities: TitanRevenueCard[];
  totalPotentialCents: number;
};

export type PartnerEngine = {
  tablesReady: boolean;
  partners: PartnerCard[];
  totalAnnualPotentialCents: number;
};

export type RecoveryEngine = {
  recoverableTodayCents: number;
  items: RecoveryItem[];
};

export type ExperimentEngine = {
  tablesReady: boolean;
  active: TitanExperiment[];
  completed: TitanExperiment[];
};

export type OpportunityGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  insight: string;
};

export type MemoryEngine = {
  insights: MemoryInsight[];
};

export type WeeklyMission = {
  isWeeklyFocus: boolean;
  potentialRevenueCents: number;
  topActions: WeeklyMissionAction[];
  recommendedFocus: string;
};

import type { ReferralCandidate } from '@/lib/titan/engines/referral';
import type { GoalEngine } from '@/lib/titan/engines/goal';
import type { OutreachKit } from '@/lib/titan/engines/outreach';
import type { TerritoryDominationEngine } from '@/lib/titan/engines/territory-domination';
import type { ContentPerformanceEngine } from '@/lib/titan/engines/content-performance';
import type { FleetEngine } from '@/lib/titan/engines/fleet';
import type { DailyAutonomy } from '@/lib/titan/engines/daily-autonomy';
import type { RevenueForecastEngine } from '@/lib/titan/engines/revenue-forecast';
import type { AttributionProof } from '@/lib/titan/engines/attribution';
import type { AcquisitionSourceRow } from '@/lib/titan/engines/acquisition-sources';
import type { LearningInsight } from '@/lib/titan/engines/action-outcomes';
import type { ScheduledTouch } from '@/lib/titan/engines/touch-schedule';
import type { JobCloseoutItem } from '@/lib/titan/engines/job-closeout';
import type { TitanOffer } from '@/lib/titan/engines/offer-builder';

export type { GoalEngine, OutreachKit, TerritoryDominationEngine, ContentPerformanceEngine, FleetEngine, DailyAutonomy, RevenueForecastEngine, ReferralCandidate };
export type OutreachEngine = { kits: OutreachKit[] };

export type ReferralEngineData = {
  candidates: ReferralCandidate[];
  autoPipelineEnabled: boolean;
};

export type AttributionEngine = {
  proofs: AttributionProof[];
  totalAttributedCents: number;
  tablesReady: boolean;
};

export type AcquisitionSourcesEngine = {
  rows: AcquisitionSourceRow[];
  headline: string;
  tablesReady: boolean;
};

export type LearningEngine = {
  insights: LearningInsight[];
};

export type TouchScheduleEngine = {
  dueToday: ScheduledTouch[];
  upcoming: ScheduledTouch[];
  tablesReady: boolean;
};

export type JobCloseoutEngine = {
  items: JobCloseoutItem[];
  pendingCount: number;
  tablesReady: boolean;
};

export type OfferEngine = {
  offers: TitanOffer[];
  tablesReady: boolean;
};

export type WorkspaceMeta = {
  demoMode: boolean;
  onboardingStep: number;
  onboardingComplete: boolean;
  subscriptionTier: string;
  subscriptionStatus: string | null;
};

export type TitanDeal = {
  id: string;
  title: string;
  potentialValueCents: number;
  status: string;
  lastTouchAt: string | null;
  nextAction: string;
  contactName: string | null;
};

export type Titan10Snapshot = {
  mission: string;
  ownerGreeting: string;
  setupWarnings: import('@/components/titan/titan-ui').TitanSetupWarning[];
  scoreboard: TitanScoreboard;
  dailyAutonomy: DailyAutonomy;
  goal: GoalEngine;
  revenueForecast: RevenueForecastEngine;
  outreach: OutreachEngine;
  referral: ReferralEngineData;
  territory: TerritoryDominationEngine;
  content: ContentPerformanceEngine;
  fleet: FleetEngine;
  deals: TitanDeal[];
  acquisition: AcquisitionEngine;
  partners: PartnerEngine;
  recovery: RecoveryEngine;
  experiments: ExperimentEngine;
  graph: OpportunityGraph;
  memory: MemoryEngine;
  weeklyMission: WeeklyMission;
  attribution: AttributionEngine;
  acquisitionSources: AcquisitionSourcesEngine;
  learning: LearningEngine;
  touchSchedule: TouchScheduleEngine;
  jobCloseouts: JobCloseoutEngine;
  offers: OfferEngine;
  workspaceMeta: WorkspaceMeta;
};

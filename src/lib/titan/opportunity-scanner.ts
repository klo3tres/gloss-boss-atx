import type { SupabaseClient } from '@supabase/supabase-js';
import { logTitanActivity } from '@/lib/titan/activity-feed';

export const WATCH_KEYWORDS = [
  'car detailer',
  'mobile detailer',
  'mobile detail',
  'ceramic coating',
  'interior cleaning',
  'pressure washing',
  'lawn care',
  'fleet washing',
  'detail before selling',
  'recommend a detailer',
  'company vehicles',
  'apartment complex',
];

export type OpportunityPlatform =
  | 'manual'
  | 'facebook_group'
  | 'nextdoor'
  | 'google_review'
  | 'community_board'
  | 'public_web'
  | 'referral'
  | 'other';

export type OpportunityType =
  | 'homeowner'
  | 'fleet'
  | 'apartment'
  | 'dealership'
  | 'b2b'
  | 'pressure_wash'
  | 'landscaping'
  | 'other';

export type OpportunityTier = 'easy' | 'medium' | 'high_impact' | 'whale';

export type OpportunityStatus = 'new' | 'contacted' | 'replied' | 'pipeline' | 'won' | 'lost' | 'dismissed';

export type TitanOpportunity = {
  id: string;
  title: string;
  body: string | null;
  sourcePlatform: OpportunityPlatform;
  sourceLabel: string | null;
  sourceUrl: string | null;
  keywordMatched: string | null;
  authorName: string | null;
  postedAt: string | null;
  minutesAgo: number | null;
  commentsCount: number;
  engagementLevel: 'low' | 'medium' | 'high';
  opportunityType: OpportunityType;
  tier: OpportunityTier;
  score: number;
  urgencyScore: number;
  competitionScore: number;
  valueCents: number;
  closeLikelihoodPercent: number;
  status: OpportunityStatus;
  suggestedReply: string | null;
  suggestedDm: string | null;
  leadId: string | null;
};

export type DailyHunt = {
  date: string;
  count: number;
  potentialCents: number;
  byType: Partial<Record<OpportunityType, number>>;
  opportunities: TitanOpportunity[];
};

export type FirstResponderAlert = {
  opportunity: TitanOpportunity;
  headline: string;
  reason: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function isMissingTable(message: string) {
  return /titan_opportunit|schema cache|does not exist/i.test(message);
}

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 60000));
}

function matchKeyword(text: string): string | null {
  const hay = text.toLowerCase();
  for (const kw of WATCH_KEYWORDS) {
    if (hay.includes(kw)) return kw;
  }
  return null;
}

function inferType(text: string): OpportunityType {
  const hay = text.toLowerCase();
  if (/fleet|company vehicle|commercial truck/.test(hay)) return 'fleet';
  if (/apartment|resident|multifamily|hoa/.test(hay)) return 'apartment';
  if (/dealership|dealer|lot/.test(hay)) return 'dealership';
  if (/pressure wash/.test(hay)) return 'pressure_wash';
  if (/lawn|landscap/.test(hay)) return 'landscaping';
  if (/business|office|b2b/.test(hay)) return 'b2b';
  return 'homeowner';
}

function defaultValueCents(type: OpportunityType): number {
  // Heuristic category estimates only — never treat as booked revenue.
  const map: Record<OpportunityType, number> = {
    homeowner: 0,
    fleet: 0,
    apartment: 0,
    dealership: 0,
    b2b: 0,
    pressure_wash: 0,
    landscaping: 0,
    other: 0,
  };
  return map[type];
}

function tierFromTypeAndValue(type: OpportunityType, valueCents: number): OpportunityTier {
  if (type === 'fleet' || type === 'apartment' || type === 'dealership') {
    return valueCents >= 100000 ? 'whale' : 'high_impact';
  }
  if (valueCents >= 100000) return 'whale';
  if (valueCents >= 80000 || type === 'b2b') return 'high_impact';
  if (valueCents >= 40000) return 'medium';
  return 'easy';
}

export function scoreOpportunity(input: {
  title: string;
  body?: string;
  postedAt?: string | null;
  commentsCount?: number;
  opportunityType?: OpportunityType;
  valueCents?: number;
}): {
  score: number;
  urgencyScore: number;
  competitionScore: number;
  closeLikelihoodPercent: number;
  tier: OpportunityTier;
  opportunityType: OpportunityType;
  valueCents: number;
  keywordMatched: string | null;
  engagementLevel: 'low' | 'medium' | 'high';
} {
  const text = `${input.title} ${input.body ?? ''}`;
  const keywordMatched = matchKeyword(text);
  const opportunityType = input.opportunityType ?? inferType(text);
  const valueCents = input.valueCents ?? defaultValueCents(opportunityType);
  const comments = input.commentsCount ?? 0;
  const minutes = minutesSince(input.postedAt ?? null);

  let urgencyScore = 40;
  if (minutes != null) {
    if (minutes <= 20) urgencyScore = 98;
    else if (minutes <= 60) urgencyScore = 88;
    else if (minutes <= 240) urgencyScore = 72;
    else if (minutes <= 1440) urgencyScore = 55;
    else urgencyScore = 35;
  }

  let competitionScore = 70;
  if (comments === 0) competitionScore = 95;
  else if (comments <= 2) competitionScore = 82;
  else if (comments <= 5) competitionScore = 60;
  else competitionScore = 35;

  const engagementLevel: 'low' | 'medium' | 'high' =
    comments <= 2 ? 'low' : comments <= 8 ? 'medium' : 'high';

  let score = 45;
  if (keywordMatched) score += 18;
  score += Math.round(urgencyScore * 0.22);
  score += Math.round(competitionScore * 0.2);
  if (opportunityType === 'fleet' || opportunityType === 'apartment') score += 12;
  if (opportunityType === 'dealership') score += 10;
  score = Math.min(99, Math.max(1, score));

  let closeLikelihoodPercent = 35;
  if (comments === 0 && minutes != null && minutes < 120) closeLikelihoodPercent = 72;
  else if (comments <= 2) closeLikelihoodPercent = 58;
  else closeLikelihoodPercent = 40;
  if (opportunityType === 'homeowner') closeLikelihoodPercent += 8;

  const tier = tierFromTypeAndValue(opportunityType, valueCents);

  return {
    score,
    urgencyScore,
    competitionScore,
    closeLikelihoodPercent,
    tier,
    opportunityType,
    valueCents,
    keywordMatched,
    engagementLevel,
  };
}

function buildSuggestedOutreach(title: string, type: OpportunityType): { reply: string; dm: string } {
  if (type === 'fleet' || type === 'apartment' || type === 'dealership') {
    return {
      reply:
        'Gloss Boss ATX does mobile fleet & property detailing across Round Rock, Pflugerville, Georgetown, and Austin. Happy to share a quick quote for your setup.',
      dm: `Hi — saw your post about "${title.slice(0, 60)}". We specialize in mobile ${type === 'apartment' ? 'resident' : 'fleet'} programs. Want a 10-min call this week?`,
    };
  }
  return {
    reply:
      'Gloss Boss ATX is a mobile detailer in your area — we come to you. Happy to help with a quote or book online if you want the next open slot.',
    dm: `Hi! Saw you're looking for a mobile detailer. Gloss Boss ATX serves Round Rock, Pflugerville, Georgetown & Austin. Want me to send pricing for your vehicle?`,
  };
}

function mapRow(row: Record<string, unknown>): TitanOpportunity {
  const postedAt = str(row.posted_at) || null;
  return {
    id: str(row.id),
    title: str(row.title),
    body: str(row.body) || null,
    sourcePlatform: str(row.source_platform) as OpportunityPlatform,
    sourceLabel: str(row.source_label) || null,
    sourceUrl: str(row.source_url) || null,
    keywordMatched: str(row.keyword_matched) || null,
    authorName: str(row.author_name) || null,
    postedAt,
    minutesAgo: minutesSince(postedAt),
    commentsCount: Number(row.comments_count ?? 0),
    engagementLevel: (str(row.engagement_level) || 'low') as 'low' | 'medium' | 'high',
    opportunityType: str(row.opportunity_type) as OpportunityType,
    tier: str(row.tier) as OpportunityTier,
    score: Number(row.score ?? 0),
    urgencyScore: Number(row.urgency_score ?? 0),
    competitionScore: Number(row.competition_score ?? 0),
    valueCents: Number(row.value_cents ?? 0),
    closeLikelihoodPercent: Number(row.close_likelihood_percent ?? 0),
    status: str(row.status) as OpportunityStatus,
    suggestedReply: str(row.suggested_reply) || null,
    suggestedDm: str(row.suggested_dm) || null,
    leadId: str(row.lead_id) || null,
  };
}

export async function addOpportunity(
  admin: SupabaseClient,
  input: {
    title: string;
    body?: string;
    sourcePlatform?: OpportunityPlatform;
    sourceLabel?: string;
    sourceUrl?: string;
    authorName?: string;
    postedAt?: string;
    commentsCount?: number;
    opportunityType?: OpportunityType;
    valueCents?: number;
  },
) {
  const scored = scoreOpportunity(input);
  const outreach = buildSuggestedOutreach(input.title, scored.opportunityType);
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from('titan_opportunities')
    .insert({
      title: input.title.trim(),
      body: input.body?.trim() || null,
      source_platform: input.sourcePlatform ?? 'manual',
      source_label: input.sourceLabel ?? null,
      source_url: input.sourceUrl ?? null,
      keyword_matched: scored.keywordMatched,
      author_name: input.authorName ?? null,
      posted_at: input.postedAt ?? now,
      comments_count: input.commentsCount ?? 0,
      engagement_level: scored.engagementLevel,
      opportunity_type: scored.opportunityType,
      tier: scored.tier,
      score: scored.score,
      urgency_score: scored.urgencyScore,
      competition_score: scored.competitionScore,
      value_cents: scored.valueCents,
      close_likelihood_percent: scored.closeLikelihoodPercent,
      suggested_reply: outreach.reply,
      suggested_dm: outreach.dm,
      status: 'new',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };

  if (scored.score >= 85) {
    await logTitanActivity(admin, {
      kind: 'prospect_discovered',
      title: 'High impact opportunity logged',
      detail: `${input.title.slice(0, 80)} · score ${scored.score}`,
      impactCents: scored.valueCents,
      href: '/admin/super',
    });
  }

  return { ok: true as const, id: str(data?.id) };
}

export async function loadOpportunityScanner(admin: SupabaseClient): Promise<{
  tablesReady: boolean;
  feed: TitanOpportunity[];
  dailyHunt: DailyHunt;
  firstResponder: FirstResponderAlert | null;
}> {
  const probe = await admin.from('titan_opportunities').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) {
    return {
      tablesReady: false,
      feed: [],
      dailyHunt: { date: new Date().toISOString().slice(0, 10), count: 0, potentialCents: 0, byType: {}, opportunities: [] },
      firstResponder: null,
    };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data } = await admin
    .from('titan_opportunities')
    .select('*')
    .not('status', 'in', '("won","lost","dismissed")')
    .order('score', { ascending: false })
    .limit(50);

  const feed = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));

  const todayOpps = feed.filter((o) => {
    const created = o.postedAt ?? '';
    return created && new Date(created) >= todayStart;
  });

  const byType: Partial<Record<OpportunityType, number>> = {};
  let potentialCents = 0;
  for (const o of todayOpps.length ? todayOpps : feed.slice(0, 10)) {
    byType[o.opportunityType] = (byType[o.opportunityType] ?? 0) + 1;
    potentialCents += o.valueCents;
  }

  const hunt: DailyHunt = {
    date: todayStart.toISOString().slice(0, 10),
    count: todayOpps.length || feed.filter((o) => o.status === 'new').length,
    potentialCents,
    byType,
    opportunities: (todayOpps.length ? todayOpps : feed).slice(0, 8),
  };

  const firstResponderOpp = feed.find(
    (o) =>
      o.status === 'new' &&
      o.score >= 85 &&
      (o.minutesAgo == null || o.minutesAgo <= 180) &&
      o.commentsCount < 4,
  );

  const firstResponder: FirstResponderAlert | null = firstResponderOpp
    ? {
        opportunity: firstResponderOpp,
        headline: 'High Impact Opportunity',
        reason: `${firstResponderOpp.commentsCount} responses · posted ${firstResponderOpp.minutesAgo ?? '?'} min ago · score ${firstResponderOpp.score}`,
      }
    : null;

  const huntProbe = await admin.from('titan_opportunity_hunts').select('id').limit(1);
  if (!huntProbe.error) {
    await admin.from('titan_opportunity_hunts').upsert(
      {
        hunt_date: hunt.date,
        opportunity_count: hunt.count,
        potential_cents: hunt.potentialCents,
        by_type: hunt.byType,
      },
      { onConflict: 'hunt_date' },
    );
  }

  return { tablesReady: true, feed, dailyHunt: hunt, firstResponder };
}

export async function updateOpportunityStatus(
  admin: SupabaseClient,
  id: string,
  status: OpportunityStatus,
  extra?: { lostReason?: string },
) {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: now };
  if (status === 'contacted' || status === 'replied') patch.contacted_at = now;
  if (status === 'won') patch.won_at = now;
  if (status === 'lost') patch.lost_reason = extra?.lostReason ?? null;

  const { error } = await admin.from('titan_opportunities').update(patch).eq('id', id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function promoteOpportunityToLead(admin: SupabaseClient, opportunityId: string) {
  const { data: row } = await admin.from('titan_opportunities').select('*').eq('id', opportunityId).maybeSingle();
  if (!row) return { ok: false as const, error: 'Not found' };

  const o = row as Record<string, unknown>;
  const now = new Date().toISOString();
  const { data: lead, error } = await admin
    .from('leads')
    .insert({
      name: str(o.author_name) || 'Opportunity lead',
      notes: `Titan Opportunity Scanner\n${str(o.title)}\n\n${str(o.body)}`,
      lead_source: 'titan_opportunity_scanner',
      marketing_channel: 'buying_signal',
      status: 'new',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };

  await admin
    .from('titan_opportunities')
    .update({ status: 'pipeline', lead_id: lead?.id, updated_at: now })
    .eq('id', opportunityId);

  await logTitanActivity(admin, {
    kind: 'lead_discovered',
    title: 'Opportunity added to pipeline',
    detail: str(o.title),
    href: '/admin/leads',
  });

  return { ok: true as const, leadId: str(lead?.id) };
}

export const TIER_LABELS: Record<OpportunityTier, string> = {
  easy: 'Easy',
  medium: 'Medium',
  high_impact: 'High Impact',
  whale: 'Whale',
};

export type OpportunityLearning = {
  won: number;
  lost: number;
  winRatePercent: number;
  topWinType: OpportunityType | null;
  topLostReason: string | null;
};

export async function loadOpportunityLearning(admin: SupabaseClient): Promise<OpportunityLearning> {
  const probe = await admin.from('titan_opportunities').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) {
    return { won: 0, lost: 0, winRatePercent: 0, topWinType: null, topLostReason: null };
  }

  const { data } = await admin
    .from('titan_opportunities')
    .select('status, opportunity_type, lost_reason')
    .in('status', ['won', 'lost']);

  const rows = data ?? [];
  const won = rows.filter((r) => str((r as Record<string, unknown>).status) === 'won').length;
  const lost = rows.filter((r) => str((r as Record<string, unknown>).status) === 'lost').length;
  const total = won + lost;
  const winRatePercent = total > 0 ? Math.round((won / total) * 100) : 0;

  const winTypes = new Map<OpportunityType, number>();
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    if (str(row.status) !== 'won') continue;
    const t = str(row.opportunity_type) as OpportunityType;
    winTypes.set(t, (winTypes.get(t) ?? 0) + 1);
  }
  const topWinType =
    [...winTypes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const lostReasons = new Map<string, number>();
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    if (str(row.status) !== 'lost') continue;
    const reason = str(row.lost_reason) || 'No reason recorded';
    lostReasons.set(reason, (lostReasons.get(reason) ?? 0) + 1);
  }
  const topLostReason = [...lostReasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return { won, lost, winRatePercent, topWinType, topLostReason };
}

export const TYPE_LABELS: Record<OpportunityType, string> = {
  homeowner: 'Homeowner inquiry',
  fleet: 'Fleet opportunity',
  apartment: 'Apartment complex',
  dealership: 'Dealership',
  b2b: 'B2B',
  pressure_wash: 'Pressure washing',
  landscaping: 'Landscaping',
  other: 'Other',
};

export const PLATFORM_LABELS: Record<OpportunityPlatform, string> = {
  manual: 'Manual',
  facebook_group: 'Facebook group',
  nextdoor: 'Nextdoor',
  google_review: 'Google review',
  community_board: 'Community board',
  public_web: 'Public web',
  referral: 'Referral',
  other: 'Other',
};

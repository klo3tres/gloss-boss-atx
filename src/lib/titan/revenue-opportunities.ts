import type { SupabaseClient } from '@supabase/supabase-js';
import { initialOpportunityFollowUpAt } from '@/lib/opportunity-follow-up-cron';
import { GLOSS_BOSS_BUSINESS_ID } from '@/lib/titan/business-ids';

export type RevenueOpportunityType =
  | 'warm_lead'
  | 'canceled_reschedule'
  | 'previous_customer'
  | 'referral'
  | 'apartment_hoa'
  | 'fleet'
  | 'dealership'
  | 'coworker_nurse'
  | 'facebook_group'
  | 'nextdoor'
  | 'google_places'
  | 'manual_prospect';

export type RevenueOpportunityStatus =
  | 'new'
  | 'seeded'
  | 'contacted'
  | 'quoted'
  | 'follow_up'
  | 'booked'
  | 'won'
  | 'lost'
  | 'ignored'
  | 'snoozed';

export type RevenueOpportunity = {
  id: string;
  title: string;
  opportunityType: RevenueOpportunityType | string;
  source: string;
  estimatedRevenueCents: number;
  confidenceScore: number;
  status: RevenueOpportunityStatus;
  recommendedAction: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  socialUrl: string | null;
  notes: string | null;
  whySurfaced: string;
  recommendedMessage: string;
  createdAt: string;
  lastTouchedAt: string | null;
  nextFollowUpAt: string | null;
  workspaceKey: string;
};

export type RevenueOpportunityEvent = {
  id: string;
  opportunityId: string;
  eventType: string;
  notes: string | null;
  createdAt: string;
};

export const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  warm_lead: 'Warm lead',
  canceled_reschedule: 'Canceled / reschedule',
  previous_customer: 'Previous customer',
  referral: 'Referral',
  apartment_hoa: 'Apartment / HOA',
  fleet: 'Fleet',
  dealership: 'Dealership',
  coworker_nurse: 'Coworker / nurse lead',
  facebook_group: 'Facebook group',
  nextdoor: 'Nextdoor',
  google_places: 'Google Places',
  manual_prospect: 'Manual prospect',
};

export const STATUS_LABELS: Record<RevenueOpportunityStatus, string> = {
  new: 'New',
  seeded: 'Seeded',
  contacted: 'Contacted',
  quoted: 'Quoted',
  follow_up: 'Follow-up',
  booked: 'Booked',
  won: 'Won',
  lost: 'Lost',
  ignored: 'Ignored',
  snoozed: 'Snoozed',
};

const WARM_TYPES = new Set<string>(['warm_lead', 'canceled_reschedule', 'coworker_nurse', 'referral', 'previous_customer']);

/** Demo seeds are disabled in production — never invent fake opportunity revenue. */
const SEED_LEADS: Array<Omit<RevenueOpportunity, 'id' | 'createdAt' | 'lastTouchedAt' | 'nextFollowUpAt' | 'recommendedMessage' | 'workspaceKey'>> = [];

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function isMissingTable(message: string) {
  return /titan_opportunit|schema cache|does not exist|could not find/i.test(message);
}

function normalizeStatus(raw: string): RevenueOpportunityStatus {
  const s = raw.toLowerCase();
  if (s === 'won') return 'won';
  if (s === 'pipeline') return 'seeded';
  if (s === 'replied') return 'contacted';
  if (s === 'dismissed') return 'ignored';
  if (s === 'quoted') return 'quoted';
  if (s === 'seeded') return 'seeded';
  if (s === 'snoozed') return 'snoozed';
  if (['new', 'contacted', 'follow_up', 'booked', 'lost', 'ignored'].includes(s)) return s as RevenueOpportunityStatus;
  return 'new';
}

function normalizeType(raw: string): string {
  const map: Record<string, string> = {
    homeowner: 'warm_lead',
    apartment: 'apartment_hoa',
    b2b: 'fleet',
    other: 'manual_prospect',
  };
  return map[raw] ?? raw;
}

export function generateRecommendedMessage(opp: Pick<RevenueOpportunity, 'opportunityType' | 'contactName' | 'title'>): string {
  const name = opp.contactName || 'there';
  const type = normalizeType(opp.opportunityType);

  switch (type) {
    case 'warm_lead':
    case 'coworker_nurse':
    case 'referral':
      return `Hey ${name}, I had an opening come up this weekend for an interior detail and wanted to check with you first before I offer it out. Want me to lock you in?`;
    case 'canceled_reschedule':
      return `Hey ${name}, no worries on rescheduling. I have Tuesday or Wednesday open next week if you still want to get your vehicle taken care of. Want me to save that spot for you?`;
    case 'previous_customer':
      return `Hey ${name}, it's Kyle with Gloss Boss ATX — hope the vehicle still looks great. I have a couple openings this week if you want a refresh. Want me to hold one for you?`;
    case 'apartment_hoa':
      return `Hey, my name is Kyle with Gloss Boss ATX. We're a mobile detailing service in the Austin/Round Rock area. I wanted to see if your residents ever ask for convenient on-site vehicle detailing. I'd love to offer a resident detail day or preferred-rate option.`;
    case 'fleet':
    case 'dealership':
      return `Hey, my name is Kyle with Gloss Boss ATX. We help small fleets keep vehicles clean without disrupting their workday. I wanted to see who handles vehicle cleaning for your team.`;
    case 'facebook_group':
    case 'nextdoor':
      return `Hi ${name}! Kyle here with Gloss Boss ATX — mobile premium detailing in Austin. Happy to help if you're still looking. I can send pricing or hold a spot this week if useful.`;
    case 'google_places':
      return `Hi ${name}, Kyle with Gloss Boss ATX. I saw your business on Google and wanted to reach out about mobile fleet or lot detailing. Who's the best person to talk to?`;
    default:
      return `Hey ${name}, Kyle with Gloss Boss ATX — mobile premium detailing. I had a thought about ${opp.title.toLowerCase()}. Open to a quick chat?`;
  }
}

export function defaultWhySurfaced(type: string): string {
  const t = normalizeType(type);
  if (t === 'warm_lead' || t === 'coworker_nurse') return 'Warm lead with stated interest and no booked appointment.';
  if (t === 'canceled_reschedule') return 'Canceled due to payday; likely rebook candidate.';
  if (t === 'apartment_hoa' || t === 'fleet' || t === 'dealership') return 'High-value B2B prospect with repeat revenue potential.';
  if (t === 'previous_customer') return 'Previous customer without review/referral follow-up.';
  if (t === 'referral') return 'Referral lead — high trust, fast close potential.';
  return 'Manually added revenue opportunity.';
}

function rowToOpportunity(row: Record<string, unknown>): RevenueOpportunity {
  const type = normalizeType(str(row.opportunity_type) || 'manual_prospect');
  const base: RevenueOpportunity = {
    id: str(row.id),
    title: str(row.title) || 'Untitled opportunity',
    opportunityType: type,
    source: str(row.source_label_custom) || str(row.source_label) || str(row.source_platform) || 'Manual',
    estimatedRevenueCents: Number(row.value_cents ?? 0) || 0,
    confidenceScore: Number(row.confidence_score ?? row.close_likelihood_percent ?? 50) || 50,
    status: normalizeStatus(str(row.status) || 'new'),
    recommendedAction: str(row.recommended_action) || str(row.suggested_dm) || 'Reach out with the recommended message.',
    contactName: str(row.author_name) || null,
    contactPhone: str(row.contact_phone) || null,
    contactEmail: str(row.contact_email) || null,
    socialUrl: str(row.source_url) || null,
    notes: str(row.notes) || str(row.body) || null,
    whySurfaced: str(row.why_surfaced) || defaultWhySurfaced(type),
    recommendedMessage: '',
    createdAt: str(row.created_at) || new Date().toISOString(),
    lastTouchedAt: str(row.last_touched_at) || str(row.contacted_at) || null,
    nextFollowUpAt: str(row.next_follow_up_at) || null,
    workspaceKey: str(row.workspace_key) || 'default',
  };
  base.recommendedMessage =
    str(row.suggested_reply) || str(row.suggested_dm) || generateRecommendedMessage(base);
  return {
    ...base,
    businessName: str(row.business_name) || null,
    businessCategory: str(row.business_category) || null,
    businessAddress: str(row.business_address) || null,
    websiteUrl: str(row.website_url) || null,
    estimatedVehicleCount: row.estimated_vehicle_count != null ? Number(row.estimated_vehicle_count) : null,
    distanceMiles: row.distance_miles != null ? Number(row.distance_miles) : null,
    valueExplanation: str(row.value_explanation) || null,
    followUpCadencePaused: Boolean(row.follow_up_cadence_paused),
  } as RevenueOpportunity & {
    businessName?: string | null;
    businessCategory?: string | null;
    businessAddress?: string | null;
    websiteUrl?: string | null;
    estimatedVehicleCount?: number | null;
    distanceMiles?: number | null;
    valueExplanation?: string | null;
    followUpCadencePaused?: boolean;
  };
}

export function rankForRevenueHunt(opportunities: RevenueOpportunity[]): RevenueOpportunity[] {
  const now = Date.now();
  const statusWeight = (s: RevenueOpportunityStatus) => (s === 'new' ? 0 : s === 'follow_up' ? 1 : 2);
  const typeWeight = (t: string) => (WARM_TYPES.has(normalizeType(t)) ? 0 : 1);
  const closed = new Set<RevenueOpportunityStatus>(['booked', 'won', 'lost', 'ignored', 'snoozed']);

  return [...opportunities]
    .filter((o) => !closed.has(o.status))
    .sort((a, b) => {
      const sw = statusWeight(a.status) - statusWeight(b.status);
      if (sw !== 0) return sw;
      const overdueA = a.nextFollowUpAt && Date.parse(a.nextFollowUpAt) < now ? 0 : 1;
      const overdueB = b.nextFollowUpAt && Date.parse(b.nextFollowUpAt) < now ? 0 : 1;
      if (overdueA !== overdueB) return overdueA - overdueB;
      const tw = typeWeight(a.opportunityType) - typeWeight(b.opportunityType);
      if (tw !== 0) return tw;
      if (b.estimatedRevenueCents !== a.estimatedRevenueCents) return b.estimatedRevenueCents - a.estimatedRevenueCents;
      return b.confidenceScore - a.confidenceScore;
    });
}

export function whyTitanPicked(opp: RevenueOpportunity): string {
  const parts: string[] = [opp.whySurfaced];
  if (opp.status === 'follow_up') parts.push('Already in follow-up — stay on it.');
  if (opp.nextFollowUpAt && Date.parse(opp.nextFollowUpAt) < Date.now()) parts.push('Follow-up date is overdue.');
  if (WARM_TYPES.has(normalizeType(opp.opportunityType))) parts.push('Warm lead types convert fastest.');
  if (opp.estimatedRevenueCents >= 100000) parts.push('High estimated revenue.');
  return parts.filter(Boolean).join(' ');
}

export async function loadRevenueOpportunities(
  admin: SupabaseClient,
  workspaceKey = 'default',
  businessId?: string,
): Promise<{ opportunities: RevenueOpportunity[]; tablesReady: boolean; error?: string }> {
  let query = admin.from('titan_opportunities').select('*').eq('workspace_key', workspaceKey);
  let resolvedBusinessId = businessId;
  if (!resolvedBusinessId && workspaceKey === 'default') {
    resolvedBusinessId = GLOSS_BOSS_BUSINESS_ID;
  } else if (!resolvedBusinessId) {
    const { data: biz } = await admin.from('businesses').select('id').eq('workspace_key', workspaceKey).maybeSingle();
    resolvedBusinessId = biz?.id ? String(biz.id) : undefined;
  }
  if (resolvedBusinessId) query = query.eq('business_id', resolvedBusinessId);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(200);

  if (error) {
    if (isMissingTable(error.message)) return { opportunities: [], tablesReady: false, error: error.message };
    return { opportunities: [], tablesReady: true, error: error.message };
  }

  return { opportunities: (data ?? []).map((r) => rowToOpportunity(r as Record<string, unknown>)), tablesReady: true };
}

export async function loadOpportunityEvents(
  admin: SupabaseClient,
  opportunityId: string,
): Promise<RevenueOpportunityEvent[]> {
  const { data, error } = await admin
    .from('titan_opportunity_events')
    .select('id, opportunity_id, event_type, notes, created_at')
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error || !data) return [];
  return data.map((r) => ({
    id: str((r as Record<string, unknown>).id),
    opportunityId: str((r as Record<string, unknown>).opportunity_id),
    eventType: str((r as Record<string, unknown>).event_type),
    notes: str((r as Record<string, unknown>).notes) || null,
    createdAt: str((r as Record<string, unknown>).created_at),
  }));
}

export async function loadRecentOpportunityEvents(
  admin: SupabaseClient,
  workspaceKey = 'default',
  limit = 10,
): Promise<Array<RevenueOpportunityEvent & { opportunityTitle?: string }>> {
  const { data, error } = await admin
    .from('titan_opportunity_events')
    .select('id, opportunity_id, event_type, notes, created_at, titan_opportunities(title)')
    .eq('workspace_key', workspaceKey)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((r) => {
    const row = r as Record<string, unknown>;
    const opp = row.titan_opportunities as { title?: string } | null;
    return {
      id: str(row.id),
      opportunityId: str(row.opportunity_id),
      eventType: str(row.event_type),
      notes: str(row.notes) || null,
      createdAt: str(row.created_at),
      opportunityTitle: opp?.title,
    };
  });
}

async function logEvent(
  admin: SupabaseClient,
  opportunityId: string,
  eventType: string,
  notes?: string,
  workspaceKey = 'default',
) {
  await admin.from('titan_opportunity_events').insert({
    opportunity_id: opportunityId,
    event_type: eventType,
    notes: notes ?? null,
    workspace_key: workspaceKey,
    created_at: new Date().toISOString(),
  });
}

function normalizePhoneDigits(phone: string | null | undefined): string {
  return str(phone).replace(/\D/g, '').slice(-10);
}

function normalizeNameKey(name: string | null | undefined): string {
  return str(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function findDuplicateOpportunityId(
  admin: SupabaseClient,
  input: {
    title: string;
    contactPhone?: string;
    contactEmail?: string;
    businessName?: string;
    businessAddress?: string;
    sourceUrl?: string;
    keywordMatched?: string;
  },
  workspaceKey: string,
): Promise<string | null> {
  if (input.keywordMatched) {
    const { data } = await admin
      .from('titan_opportunities')
      .select('id')
      .eq('workspace_key', workspaceKey)
      .eq('keyword_matched', input.keywordMatched)
      .limit(1)
      .maybeSingle();
    if (data?.id) return str(data.id);
  }

  if (input.sourceUrl) {
    const { data } = await admin
      .from('titan_opportunities')
      .select('id')
      .eq('workspace_key', workspaceKey)
      .eq('source_url', input.sourceUrl)
      .limit(1)
      .maybeSingle();
    if (data?.id) return str(data.id);
  }

  const phone = normalizePhoneDigits(input.contactPhone);
  if (phone.length >= 10) {
    const { data } = await admin
      .from('titan_opportunities')
      .select('id, contact_phone')
      .eq('workspace_key', workspaceKey)
      .not('status', 'in', '(lost,ignored)')
      .not('contact_phone', 'is', null)
      .limit(200);
    const hit = (data ?? []).find((r) => normalizePhoneDigits((r as { contact_phone?: string }).contact_phone) === phone);
    if (hit?.id) return str(hit.id);
  }

  const email = str(input.contactEmail).toLowerCase();
  if (email) {
    const { data } = await admin
      .from('titan_opportunities')
      .select('id')
      .eq('workspace_key', workspaceKey)
      .ilike('contact_email', email)
      .not('status', 'in', '(lost,ignored)')
      .limit(1)
      .maybeSingle();
    if (data?.id) return str(data.id);
  }

  const nameKey = normalizeNameKey(input.businessName || input.title);
  const addrKey = normalizeNameKey(input.businessAddress);
  if (nameKey) {
    const { data } = await admin
      .from('titan_opportunities')
      .select('id, title, business_name, business_address')
      .eq('workspace_key', workspaceKey)
      .not('status', 'in', '(lost,ignored)')
      .limit(300);
    const hit = (data ?? []).find((r) => {
      const row = r as { title?: string; business_name?: string; business_address?: string };
      const rowName = normalizeNameKey(row.business_name || row.title);
      if (rowName !== nameKey) return false;
      if (!addrKey) return true;
      return normalizeNameKey(row.business_address) === addrKey;
    });
    if (hit?.id) return str(hit.id);
  }

  return null;
}

export async function createRevenueOpportunity(
  admin: SupabaseClient,
  input: {
    title: string;
    opportunityType: string;
    estimatedRevenueCents: number;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    socialUrl?: string;
    notes?: string;
    recommendedAction?: string;
    source?: string;
    confidenceScore?: number;
    whySurfaced?: string;
    businessName?: string;
    businessAddress?: string;
    websiteUrl?: string;
    businessCategory?: string;
    estimatedVehicleCount?: number;
    distanceMiles?: number;
    valueExplanation?: string;
    sourceUrl?: string;
    keywordMatched?: string;
  },
  workspaceKey = 'default',
): Promise<{ ok: boolean; id?: string; error?: string; duplicate?: boolean }> {
  const dupId = await findDuplicateOpportunityId(
    admin,
    {
      title: input.title,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      businessName: input.businessName,
      businessAddress: input.businessAddress,
      sourceUrl: input.sourceUrl ?? input.socialUrl ?? input.websiteUrl,
      keywordMatched: input.keywordMatched,
    },
    workspaceKey,
  );
  if (dupId) return { ok: true, id: dupId, duplicate: true };

  const now = new Date().toISOString();
  const type = normalizeType(input.opportunityType);
  const draft: RevenueOpportunity = {
    id: '',
    title: input.title,
    opportunityType: type,
    source: input.source ?? 'Manual',
    estimatedRevenueCents: input.estimatedRevenueCents,
    confidenceScore: input.confidenceScore ?? 65,
    status: 'new',
    recommendedAction: input.recommendedAction ?? 'Send the recommended message.',
    contactName: input.contactName ?? null,
    contactPhone: input.contactPhone ?? null,
    contactEmail: input.contactEmail ?? null,
    socialUrl: input.socialUrl ?? null,
    notes: input.notes ?? null,
    whySurfaced: input.whySurfaced ?? defaultWhySurfaced(type),
    recommendedMessage: '',
    createdAt: now,
    lastTouchedAt: null,
    nextFollowUpAt: null,
    workspaceKey,
  };
  const message = generateRecommendedMessage(draft);
  const created = new Date(now);
  let businessId: string | null = workspaceKey === 'default' ? GLOSS_BOSS_BUSINESS_ID : null;
  if (!businessId) {
    const { data: biz } = await admin.from('businesses').select('id').eq('workspace_key', workspaceKey).maybeSingle();
    businessId = biz?.id ? String(biz.id) : null;
  }

  const sourceUrl = input.sourceUrl ?? input.socialUrl ?? input.websiteUrl ?? null;
  const row: Record<string, unknown> = {
    title: input.title,
    body: input.notes ?? null,
    source_platform: 'manual',
    source_label: input.source ?? 'Manual',
    source_label_custom: input.source ?? 'Manual',
    source_url: sourceUrl,
    keyword_matched: input.keywordMatched ?? null,
    author_name: input.contactName ?? null,
    contact_phone: input.contactPhone ?? null,
    contact_email: input.contactEmail ?? null,
    opportunity_type: type,
    value_cents: input.estimatedRevenueCents,
    confidence_score: input.confidenceScore ?? 65,
    close_likelihood_percent: input.confidenceScore ?? 65,
    status: 'new',
    recommended_action: input.recommendedAction ?? 'Send the recommended message.',
    why_surfaced: draft.whySurfaced,
    suggested_reply: message,
    suggested_dm: message,
    notes: input.notes ?? null,
    workspace_key: workspaceKey,
    business_id: businessId,
    created_at: now,
    updated_at: now,
    follow_up_step: 0,
    next_follow_up_at: initialOpportunityFollowUpAt(created),
    business_name: input.businessName ?? null,
    business_address: input.businessAddress ?? null,
    website_url: input.websiteUrl ?? null,
    business_category: input.businessCategory ?? null,
    estimated_vehicle_count: input.estimatedVehicleCount ?? null,
    distance_miles: input.distanceMiles ?? null,
    value_explanation: input.valueExplanation ?? null,
  };

  let { data, error } = await admin.from('titan_opportunities').insert(row).select('id').single();
  if (error && /business_name|business_address|website_url|value_explanation|estimated_vehicle|distance_miles|column .* does not exist|schema cache/i.test(error.message)) {
    const {
      business_name: _bn,
      business_address: _ba,
      website_url: _wu,
      business_category: _bc,
      estimated_vehicle_count: _ev,
      distance_miles: _dm,
      value_explanation: _ve,
      ...legacy
    } = row;
    const retry = await admin.from('titan_opportunities').insert(legacy).select('id').single();
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    if (isMissingTable(error.message)) return { ok: false, error: 'Apply migration 000100 for Titan opportunities.' };
    return { ok: false, error: error.message };
  }

  const id = str((data as { id?: string })?.id);
  if (id) await logEvent(admin, id, 'created', 'Manual opportunity added', workspaceKey);
  return { ok: true, id };
}

export async function updateOpportunityStatus(
  admin: SupabaseClient,
  id: string,
  status: RevenueOpportunityStatus,
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    updated_at: now,
    last_touched_at: now,
  };
  if (status === 'contacted') patch.contacted_at = now;
  if (status === 'booked') patch.won_at = now;

  const { error } = await admin.from('titan_opportunities').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };

  await logEvent(admin, id, status, notes);
  return { ok: true };
}

export async function scheduleOpportunityFollowUp(
  admin: SupabaseClient,
  id: string,
  nextFollowUpAt: string,
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from('titan_opportunities')
    .update({
      status: 'follow_up',
      next_follow_up_at: nextFollowUpAt,
      last_touched_at: now,
      updated_at: now,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  await logEvent(admin, id, 'follow_up_scheduled', `Next follow-up: ${nextFollowUpAt}`);
  return { ok: true };
}

export async function seedWarmLeads(admin: SupabaseClient, workspaceKey = 'default'): Promise<{ ok: boolean; inserted: number; error?: string }> {
  if (process.env.NODE_ENV === 'production' || SEED_LEADS.length === 0) {
    return { ok: true, inserted: 0, error: 'Demo seed leads are disabled. Add real opportunities or convert Lead Radar items.' };
  }
  const { data: existing } = await admin.from('titan_opportunities').select('title').eq('workspace_key', workspaceKey).limit(500);
  const titles = new Set((existing ?? []).map((r) => str((r as { title?: string }).title).toLowerCase()));

  let inserted = 0;
  for (const seed of SEED_LEADS) {
    if (titles.has(seed.title.toLowerCase())) continue;
    const res = await createRevenueOpportunity(admin, {
      title: seed.title,
      opportunityType: seed.opportunityType,
      estimatedRevenueCents: seed.estimatedRevenueCents,
      contactName: seed.contactName ?? undefined,
      notes: seed.notes ?? undefined,
      recommendedAction: seed.recommendedAction,
      source: seed.source,
      confidenceScore: seed.confidenceScore,
      whySurfaced: seed.whySurfaced,
    }, workspaceKey);
    if (res.ok) inserted += 1;
  }
  return { ok: true, inserted };
}

export async function updateOpportunityContact(
  admin: SupabaseClient,
  id: string,
  contact: { contactName?: string; contactPhone?: string; contactEmail?: string },
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    updated_at: now,
    last_touched_at: now,
  };
  if (contact.contactName !== undefined) patch.author_name = contact.contactName.trim() || null;
  if (contact.contactPhone !== undefined) patch.contact_phone = contact.contactPhone.trim() || null;
  if (contact.contactEmail !== undefined) patch.contact_email = contact.contactEmail.trim() || null;

  const { error } = await admin.from('titan_opportunities').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };
  await logEvent(admin, id, 'contact_updated', 'Contact details updated');
  return { ok: true };
}

async function upsertDerived(
  admin: SupabaseClient,
  fingerprint: string,
  payload: Parameters<typeof createRevenueOpportunity>[1],
  workspaceKey = 'default',
): Promise<boolean> {
  const { data } = await admin
    .from('titan_opportunities')
    .select('id')
    .eq('workspace_key', workspaceKey)
    .eq('keyword_matched', fingerprint)
    .maybeSingle();
  if (data?.id) return false;

  const now = new Date().toISOString();
  const type = normalizeType(payload.opportunityType);
  const draft: RevenueOpportunity = {
    id: '',
    title: payload.title,
    opportunityType: type,
    source: payload.source ?? 'CRM',
    estimatedRevenueCents: payload.estimatedRevenueCents,
    confidenceScore: payload.confidenceScore ?? 60,
    status: 'new',
    recommendedAction: payload.recommendedAction ?? 'Reach out.',
    contactName: payload.contactName ?? null,
    contactPhone: payload.contactPhone ?? null,
    contactEmail: payload.contactEmail ?? null,
    socialUrl: null,
    notes: payload.notes ?? null,
    whySurfaced: payload.whySurfaced ?? defaultWhySurfaced(type),
    recommendedMessage: '',
    createdAt: now,
    lastTouchedAt: null,
    nextFollowUpAt: null,
    workspaceKey,
  };
  const message = generateRecommendedMessage(draft);

  const { error } = await admin.from('titan_opportunities').insert({
    title: payload.title,
    keyword_matched: fingerprint,
    body: payload.notes ?? null,
    source_platform: 'manual',
    source_label: payload.source ?? 'CRM',
    source_label_custom: payload.source ?? 'CRM',
    author_name: payload.contactName ?? null,
    contact_phone: payload.contactPhone ?? null,
    contact_email: payload.contactEmail ?? null,
    opportunity_type: type,
    value_cents: payload.estimatedRevenueCents,
    confidence_score: payload.confidenceScore ?? 60,
    close_likelihood_percent: payload.confidenceScore ?? 60,
    status: 'new',
    recommended_action: payload.recommendedAction ?? 'Reach out.',
    why_surfaced: draft.whySurfaced,
    suggested_reply: message,
    suggested_dm: message,
    notes: payload.notes ?? null,
    workspace_key: workspaceKey,
    created_at: now,
    updated_at: now,
  });

  return !error;
}

export async function syncDerivedRevenueOpportunities(admin: SupabaseClient, workspaceKey = 'default'): Promise<number> {
  let created = 0;

  try {
    const canceled = await admin
      .from('appointments')
      .select('id, guest_name, guest_email, guest_phone, status, cancellation_reason, total_cents, updated_at')
      .in('status', ['cancelled', 'canceled'])
      .order('updated_at', { ascending: false })
      .limit(20);
    if (!canceled.error) {
      for (const row of canceled.data ?? []) {
        const r = row as Record<string, unknown>;
        const id = str(r.id);
        if (!id) continue;
        const added = await upsertDerived(
          admin,
          `derived:cancel:${id}`,
          {
            title: `${str(r.guest_name) || 'Customer'} — canceled booking`,
            opportunityType: 'canceled_reschedule',
            estimatedRevenueCents: Number(r.total_cents ?? 15000) || 15000,
            contactName: str(r.guest_name) || undefined,
            contactPhone: str(r.guest_phone) || undefined,
            contactEmail: str(r.guest_email) || undefined,
            notes: str(r.cancellation_reason) || 'Canceled appointment — rebook candidate.',
            recommendedAction: 'Offer next-week slot.',
            source: 'Canceled booking',
            confidenceScore: 70,
            whySurfaced: 'Canceled due to payday; likely rebook candidate.',
          },
          workspaceKey,
        );
        if (added) created += 1;
      }
    }
  } catch {
    /* graceful */
  }

  try {
    const estimates = await admin
      .from('service_estimates')
      .select('id, customer_name, customer_email, customer_phone, status, total_cents, created_at')
      .neq('status', 'booked')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!estimates.error) {
      for (const row of estimates.data ?? []) {
        const r = row as Record<string, unknown>;
        const id = str(r.id);
        if (!id) continue;
        const status = str(r.status).toLowerCase();
        if (status === 'converted' || status === 'paid') continue;
        const added = await upsertDerived(
          admin,
          `derived:estimate:${id}`,
          {
            title: `${str(r.customer_name) || 'Customer'} — estimate not booked`,
            opportunityType: 'warm_lead',
            estimatedRevenueCents: Number(r.total_cents ?? 17500) || 17500,
            contactName: str(r.customer_name) || undefined,
            contactPhone: str(r.customer_phone) || undefined,
            contactEmail: str(r.customer_email) || undefined,
            notes: 'Open estimate — follow up to close.',
            recommendedAction: 'Send estimate follow-up with available times.',
            source: 'Open estimate',
            confidenceScore: 75,
            whySurfaced: 'Warm lead with stated interest and no booked appointment.',
          },
          workspaceKey,
        );
        if (added) created += 1;
      }
    }
  } catch {
    /* table may not exist */
  }

  try {
    const completed = await admin
      .from('appointments')
      .select('id, guest_name, guest_email, guest_phone, job_completed_at, total_cents')
      .eq('status', 'completed')
      .order('job_completed_at', { ascending: false })
      .limit(15);
    if (!completed.error) {
      for (const row of completed.data ?? []) {
        const r = row as Record<string, unknown>;
        const apptId = str(r.id);
        const email = str(r.guest_email);
        if (!apptId) continue;
        const reviewCheck = email
          ? await admin.from('customer_reviews').select('id').eq('customer_email', email).limit(1)
          : { data: [] };
        if ((reviewCheck.data ?? []).length > 0) continue;
        const added = await upsertDerived(
          admin,
          `derived:review:${apptId}`,
          {
            title: `${str(r.guest_name) || 'Customer'} — review follow-up`,
            opportunityType: 'previous_customer',
            estimatedRevenueCents: Number(r.total_cents ?? 12000) || 12000,
            contactName: str(r.guest_name) || undefined,
            contactPhone: str(r.guest_phone) || undefined,
            contactEmail: email || undefined,
            notes: 'Completed job without Google review request logged.',
            recommendedAction: 'Ask for Google review + referral intro.',
            source: 'Completed job',
            confidenceScore: 60,
            whySurfaced: 'Previous customer without review/referral follow-up.',
          },
          workspaceKey,
        );
        if (added) created += 1;
      }
    }
  } catch {
    /* graceful */
  }

  // Google Places / fleet prospect enrichment -> actionable Opportunity Board records.
  try {
    const prospects = await admin
      .from('titan_prospects')
      .select('id, company_name, prospect_type, contact_name, contact_role, email, phone, address, website, distance_miles, estimated_monthly_cents, vehicle_count, score, score_reason, status, source, notes')
      .in('status', ['new', 'contacted', 'qualified', 'pipeline'])
      .order('score', { ascending: false })
      .limit(80);
    for (const raw of prospects.data ?? []) {
      const row = raw as Record<string, unknown>;
      const prospectId = str(row.id);
      const company = str(row.company_name);
      if (!prospectId || !company) continue;
      const type = str(row.prospect_type);
      const opportunityType = /apartment|hoa|property/.test(type) ? 'apartment_hoa' : /dealer/.test(type) ? 'dealership' : 'fleet';
      const monthly = Number(row.estimated_monthly_cents ?? 0) || 0;
      const result = await createRevenueOpportunity(admin, {
        title: company,
        opportunityType,
        estimatedRevenueCents: monthly,
        contactName: str(row.contact_name) || str(row.contact_role) || undefined,
        contactPhone: str(row.phone) || undefined,
        contactEmail: str(row.email) || undefined,
        businessName: company,
        businessCategory: type.replaceAll('_', ' '),
        businessAddress: str(row.address) || undefined,
        websiteUrl: str(row.website) || undefined,
        estimatedVehicleCount: Number(row.vehicle_count ?? 0) || undefined,
        distanceMiles: row.distance_miles != null ? Number(row.distance_miles) : undefined,
        notes: str(row.notes) || `Decision-maker target: ${str(row.contact_role) || 'manager'}`,
        recommendedAction: str(row.phone) ? 'Call the decision maker and offer an on-site fleet quote.' : 'Research or add a decision-maker phone/email before outreach.',
        source: str(row.source) || 'Google Places',
        confidenceScore: Number(row.score ?? 50) || 50,
        whySurfaced: str(row.score_reason) || 'Local business with repeat on-site detailing potential.',
        valueExplanation: monthly > 0 ? `Estimated monthly opportunity based on the prospect category, likely vehicle count, and local recurring-detail pricing.` : 'Value pending vehicle-count qualification.',
        sourceUrl: str(row.website) || undefined,
        keywordMatched: `prospect:${prospectId}`,
      }, workspaceKey);
      if (result.ok && !result.duplicate) created += 1;
    }
  } catch {
    /* prospect tables are optional until migrations are applied */
  }

  // High-intent web/social inquiries become mini-CRM opportunities automatically.
  try {
    const radar = await admin
      .from('titan_lead_radar_items')
      .select('id, source_type, source_name, source_url, author_name, contact_name, phone, email, location_text, raw_text, detected_intent, service_match, estimated_revenue, confidence_score, urgency_score, recommended_reply, why_titan_flagged, status')
      .in('status', ['new', 'reviewed', 'replied'])
      .gte('confidence_score', 60)
      .order('created_at', { ascending: false })
      .limit(60);
    for (const raw of radar.data ?? []) {
      const row = raw as Record<string, unknown>;
      const radarId = str(row.id);
      if (!radarId) continue;
      const contact = str(row.contact_name) || str(row.author_name) || 'Online inquiry';
      const sourceType = str(row.source_type) || 'social';
      const result = await createRevenueOpportunity(admin, {
        title: `${contact} â€” ${str(row.service_match) || 'detail inquiry'}`,
        opportunityType: sourceType.includes('facebook') ? 'facebook_group' : sourceType.includes('nextdoor') ? 'nextdoor' : 'warm_lead',
        estimatedRevenueCents: Math.round(Number(row.estimated_revenue ?? 0) * 100) || 17500,
        contactName: contact,
        contactPhone: str(row.phone) || undefined,
        contactEmail: str(row.email) || undefined,
        socialUrl: str(row.source_url) || undefined,
        notes: [str(row.raw_text), str(row.location_text) ? `Location: ${str(row.location_text)}` : ''].filter(Boolean).join('\n'),
        recommendedAction: str(row.phone) || str(row.email) ? 'Respond now while purchase intent is fresh.' : 'Open the source thread and respond publicly or add contact information.',
        source: str(row.source_name) || sourceType,
        confidenceScore: Math.max(Number(row.confidence_score ?? 60), Number(row.urgency_score ?? 0)),
        whySurfaced: str(row.why_titan_flagged) || 'High-intent public inquiry that may not have received a response.',
        sourceUrl: str(row.source_url) || undefined,
        keywordMatched: `radar:${radarId}`,
      }, workspaceKey);
      if (result.ok && result.id) {
        await admin.from('titan_lead_radar_items').update({ opportunity_id: result.id, status: 'converted_to_opportunity', updated_at: new Date().toISOString() }).eq('id', radarId);
        if (!result.duplicate) created += 1;
      }
    }
  } catch {
    /* radar tables are optional until migrations are applied */
  }

  return created;
}

export async function loadRevenueHuntBundle(admin: SupabaseClient, workspaceKey = 'default') {
  await syncDerivedRevenueOpportunities(admin, workspaceKey);
  const loaded = await loadRevenueOpportunities(admin, workspaceKey);
  const ranked = rankForRevenueHunt(loaded.opportunities);
  const followUpsDue = loaded.opportunities.filter(
    (o) =>
      o.nextFollowUpAt &&
      Date.parse(o.nextFollowUpAt) <= Date.now() &&
      o.status !== 'booked' &&
      o.status !== 'won' &&
      o.status !== 'lost' &&
      o.status !== 'ignored' &&
      o.status !== 'snoozed',
  );
  const recentEvents = await loadRecentOpportunityEvents(admin, workspaceKey, 8);
  return {
    ...loaded,
    huntTop5: ranked.slice(0, 5),
    followUpsDue: followUpsDue.sort((a, b) => Date.parse(a.nextFollowUpAt ?? '') - Date.parse(b.nextFollowUpAt ?? '')),
    recentEvents,
  };
}

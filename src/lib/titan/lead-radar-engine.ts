import type { SupabaseClient } from '@supabase/supabase-js';
import { businessCoordinates } from '@/lib/weather-config';
import { getGoogleMapsApiKey, searchNearbyPlaces, searchTextPlaces, type GeoPoint } from '@/lib/google/places-client';
import { createRevenueOpportunity } from '@/lib/titan/revenue-opportunities';

export type LeadRadarSourceType =
  | 'facebook_group'
  | 'facebook_comment'
  | 'instagram_comment'
  | 'instagram_dm'
  | 'nextdoor'
  | 'google_search'
  | 'google_places'
  | 'reddit'
  | 'craigslist'
  | 'referral'
  | 'coworker_nurse'
  | 'apartment_hoa'
  | 'fleet'
  | 'dealership'
  | 'manual';

export type LeadRadarStatus = 'new' | 'reviewed' | 'replied' | 'converted_to_opportunity' | 'ignored' | 'lost';

export type DetectedIntent =
  | 'needs_detail'
  | 'interior_cleaning'
  | 'exterior_wash'
  | 'ceramic'
  | 'fleet_cleaning'
  | 'apartment_resident_event'
  | 'recommendation_request'
  | 'competitor_mention'
  | 'complaint_about_competitor'
  | 'price_shopping'
  | 'unknown';

export type LeadRadarItem = {
  id: string;
  sourceType: LeadRadarSourceType | string;
  sourceName: string | null;
  sourceUrl: string | null;
  authorName: string | null;
  authorProfileUrl: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  locationText: string | null;
  rawText: string;
  detectedIntent: DetectedIntent | string;
  serviceMatch: string | null;
  estimatedRevenue: number;
  confidenceScore: number;
  urgencyScore: number;
  opportunityId: string | null;
  status: LeadRadarStatus;
  recommendedReply: string;
  whyTitanFlagged: string;
  createdAt: string;
  updatedAt: string;
  lastReviewedAt: string | null;
  nextFollowUpAt: string | null;
  workspaceKey: string;
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  facebook_group: 'Facebook group',
  facebook_comment: 'Facebook comment',
  instagram_comment: 'Instagram comment',
  instagram_dm: 'Instagram DM',
  nextdoor: 'Nextdoor',
  google_search: 'Google search',
  google_places: 'Google Places',
  reddit: 'Reddit',
  craigslist: 'Craigslist',
  referral: 'Referral',
  coworker_nurse: 'Coworker / nurse',
  apartment_hoa: 'Apartment / HOA',
  fleet: 'Fleet',
  dealership: 'Dealership',
  manual: 'Manual',
};

export const INTENT_LABELS: Record<string, string> = {
  needs_detail: 'Needs detail',
  interior_cleaning: 'Interior cleaning',
  exterior_wash: 'Exterior wash',
  ceramic: 'Ceramic coating',
  fleet_cleaning: 'Fleet cleaning',
  apartment_resident_event: 'Apartment / resident event',
  recommendation_request: 'Recommendation request',
  competitor_mention: 'Competitor mention',
  complaint_about_competitor: 'Competitor complaint',
  price_shopping: 'Price shopping',
  unknown: 'Unknown',
};

export const SEARCH_SUGGESTIONS = [
  'mobile detailing Round Rock',
  'car detailer Austin',
  'interior car cleaning Pflugerville',
  'who does car detailing near me',
  'Austin car club detailing',
  'Round Rock apartment resident group',
  'Georgetown fleet washing',
  'BMW Austin group detail',
  'Tesla Austin detailing',
];

export const PLATFORM_SUGGESTIONS = ['Facebook Groups', 'Nextdoor', 'Reddit', 'Google', 'Craigslist', 'Instagram comments'];

const AUSTIN_CENTER: GeoPoint = { lat: 30.2672, lng: -97.7431 };

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function isMissingTable(message: string) {
  return /titan_lead_radar|schema cache|does not exist|could not find/i.test(message);
}

export function classifyLeadIntent(rawText: string, sourceType?: string): DetectedIntent {
  const hay = rawText.toLowerCase();
  const src = (sourceType ?? '').toLowerCase();

  if (/bad job|no-show|no show|detailer canceled|overpriced|scam|ripped off|never showed/.test(hay)) {
    return 'complaint_about_competitor';
  }
  if (/who does|recommend|looking for|iso\b|anyone know|suggestions for|need a detailer/.test(hay)) {
    return 'recommendation_request';
  }
  if (/fleet|company vehicles|work trucks|work vans|commercial vehicles/.test(hay) || src === 'fleet') {
    return 'fleet_cleaning';
  }
  if (/apartment|residents|property manager|hoa\b|resident event|community/.test(hay) || src === 'apartment_hoa') {
    return 'apartment_resident_event';
  }
  if (/ceramic|coating|paint correction|ppf/.test(hay)) return 'ceramic';
  if (/exterior|wash|foam|two bucket|hand wash/.test(hay)) return 'exterior_wash';
  if (/detail|detailing|interior|clean my car|car cleaned|stains|seats|odor|shampoo|vacuum|pet hair/.test(hay)) {
    return /interior|stains|seats|odor|shampoo|vacuum|pet/.test(hay) ? 'interior_cleaning' : 'needs_detail';
  }
  if (/price|how much|cost|quote|estimate|cheapest|affordable/.test(hay)) return 'price_shopping';
  if (/competitor|other detailer|another company/.test(hay)) return 'competitor_mention';
  return 'unknown';
}

export function estimateRevenueForIntent(intent: DetectedIntent | string): number {
  const map: Record<string, number> = {
    needs_detail: 175,
    interior_cleaning: 150,
    exterior_wash: 85,
    ceramic: 450,
    fleet_cleaning: 2500,
    apartment_resident_event: 3500,
    recommendation_request: 175,
    complaint_about_competitor: 200,
    price_shopping: 150,
    competitor_mention: 0,
    unknown: 125,
  };
  return map[intent] ?? 125;
}

export function scoreLead(intent: DetectedIntent | string, rawText: string): { confidence: number; urgency: number } {
  let confidence = 45;
  let urgency = 40;
  const hay = rawText.toLowerCase();

  if (intent === 'recommendation_request') confidence += 25;
  if (intent === 'interior_cleaning' || intent === 'needs_detail') confidence += 20;
  if (intent === 'complaint_about_competitor') confidence += 15;
  if (intent === 'fleet_cleaning' || intent === 'apartment_resident_event') confidence += 10;

  if (/this weekend|today|tomorrow|asap|urgent|need soon/.test(hay)) urgency += 30;
  if (/looking for|iso|anyone/.test(hay)) urgency += 15;
  if (rawText.length > 80) confidence += 5;

  return {
    confidence: Math.min(99, Math.max(10, confidence)),
    urgency: Math.min(99, Math.max(10, urgency)),
  };
}

export function whyTitanFlaggedLead(intent: DetectedIntent | string, rawText: string): string {
  switch (intent) {
    case 'recommendation_request':
      return 'Someone is actively asking for a detailer recommendation — high-intent local lead.';
    case 'interior_cleaning':
    case 'needs_detail':
      return 'Post mentions interior/detail needs — direct service match for Gloss Boss.';
    case 'complaint_about_competitor':
      return 'Frustration with another detailer — opportunity to win the job with reliability.';
    case 'fleet_cleaning':
      return 'Fleet or commercial vehicle language — recurring B2B revenue potential.';
    case 'apartment_resident_event':
      return 'Apartment/HOA/resident context — resident detail day opportunity.';
    case 'price_shopping':
      return 'Price/quote request — respond quickly with clear mobile detail pricing.';
    default:
      return rawText.length > 20 ? 'Manual lead captured with service-related keywords.' : 'Lead captured for manual review.';
  }
}

export function generateLeadReply(input: {
  intent: DetectedIntent | string;
  authorName?: string | null;
  sourceType?: string;
}): string {
  const name = input.authorName?.trim() || 'there';
  switch (input.intent) {
    case 'recommendation_request':
      return `Hey ${name}, I run Gloss Boss ATX, a mobile detailing service in the Austin/Round Rock area. We handle interiors, exteriors, and full details. I'd be happy to help — do you want me to send over availability?`;
    case 'interior_cleaning':
    case 'needs_detail':
      return `Hey ${name}, we can help with that interior. We're mobile, so we come to you as long as water/power access is available. Want me to send you pricing and openings?`;
    case 'apartment_resident_event':
      return `Hey ${name}, I'm Kyle with Gloss Boss ATX. We offer mobile detailing and can set up resident detail days for apartments/HOAs. Who would be the best person to speak with about offering this to your residents?`;
    case 'fleet_cleaning':
      return `Hey ${name}, I'm Kyle with Gloss Boss ATX. We help small fleets keep vehicles clean without disrupting the workday. Who handles vehicle cleaning for your team?`;
    case 'complaint_about_competitor':
      return `Hey ${name}, sorry you dealt with that — I'm Kyle with Gloss Boss ATX (mobile, Austin/Round Rock). If you still need it handled, I can get you on the schedule this week. Want me to send times?`;
    case 'price_shopping':
      return `Hey ${name}, Kyle with Gloss Boss ATX — mobile detailing in Austin/Round Rock. Happy to send exact pricing for your vehicle and next openings. What are you driving?`;
    default:
      return `Hey ${name}, Kyle with Gloss Boss ATX — premium mobile detailing in Austin/Round Rock. Happy to help if you're still looking. Want pricing or a quick call?`;
  }
}

function serviceMatchForIntent(intent: string): string | null {
  const map: Record<string, string> = {
    needs_detail: 'Full / mobile detail',
    interior_cleaning: 'Interior detail',
    exterior_wash: 'Exterior wash',
    ceramic: 'Ceramic coating',
    fleet_cleaning: 'Fleet program',
    apartment_resident_event: 'Resident detail day',
    recommendation_request: 'Full detail',
  };
  return map[intent] ?? null;
}

function rowToItem(row: Record<string, unknown>): LeadRadarItem {
  return {
    id: str(row.id),
    sourceType: str(row.source_type) || 'manual',
    sourceName: str(row.source_name) || null,
    sourceUrl: str(row.source_url) || null,
    authorName: str(row.author_name) || null,
    authorProfileUrl: str(row.author_profile_url) || null,
    contactName: str(row.contact_name) || null,
    phone: str(row.phone) || null,
    email: str(row.email) || null,
    locationText: str(row.location_text) || null,
    rawText: str(row.raw_text),
    detectedIntent: str(row.detected_intent) || 'unknown',
    serviceMatch: str(row.service_match) || null,
    estimatedRevenue: Number(row.estimated_revenue ?? 0) || 0,
    confidenceScore: Number(row.confidence_score ?? 50) || 50,
    urgencyScore: Number(row.urgency_score ?? 50) || 50,
    opportunityId: str(row.opportunity_id) || null,
    status: (str(row.status) || 'new') as LeadRadarStatus,
    recommendedReply: str(row.recommended_reply),
    whyTitanFlagged: str(row.why_titan_flagged),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    lastReviewedAt: str(row.last_reviewed_at) || null,
    nextFollowUpAt: str(row.next_follow_up_at) || null,
    workspaceKey: str(row.workspace_key) || 'default',
  };
}

async function logRadarEvent(admin: SupabaseClient, itemId: string, eventType: string, notes?: string, workspaceKey = 'default') {
  await admin.from('titan_lead_radar_events').insert({
    radar_item_id: itemId,
    event_type: eventType,
    notes: notes ?? null,
    workspace_key: workspaceKey,
    created_at: new Date().toISOString(),
  });
}

export type LeadRadarSummary = {
  newCount: number;
  highConfidenceCount: number;
  needsReplyCount: number;
  convertedCount: number;
  estimatedRevenueTotal: number;
};

export async function loadLeadRadarItems(
  admin: SupabaseClient,
  workspaceKey = 'default',
): Promise<{ items: LeadRadarItem[]; tablesReady: boolean; error?: string; summary: LeadRadarSummary }> {
  const { data, error } = await admin
    .from('titan_lead_radar_items')
    .select('*')
    .eq('workspace_key', workspaceKey)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    if (isMissingTable(error.message)) {
      return { items: [], tablesReady: false, error: error.message, summary: emptySummary() };
    }
    return { items: [], tablesReady: true, error: error.message, summary: emptySummary() };
  }

  const items = (data ?? []).map((r) => rowToItem(r as Record<string, unknown>));
  return { items, tablesReady: true, summary: summarizeItems(items) };
}

function emptySummary(): LeadRadarSummary {
  return { newCount: 0, highConfidenceCount: 0, needsReplyCount: 0, convertedCount: 0, estimatedRevenueTotal: 0 };
}

export function summarizeItems(items: LeadRadarItem[]): LeadRadarSummary {
  const active = items.filter((i) => i.status !== 'ignored' && i.status !== 'lost');
  return {
    newCount: items.filter((i) => i.status === 'new').length,
    highConfidenceCount: active.filter((i) => i.confidenceScore >= 70).length,
    needsReplyCount: active.filter((i) => i.status === 'new' || i.status === 'reviewed').length,
    convertedCount: items.filter((i) => i.status === 'converted_to_opportunity').length,
    estimatedRevenueTotal: active.reduce((s, i) => s + i.estimatedRevenue, 0),
  };
}

export function topLeadRadarForToday(items: LeadRadarItem[], limit = 3): LeadRadarItem[] {
  return [...items]
    .filter((i) => i.status === 'new' || i.status === 'reviewed')
    .sort((a, b) => b.confidenceScore - a.confidenceScore || b.urgencyScore - a.urgencyScore)
    .slice(0, limit);
}

export async function captureLeadRadarItem(
  admin: SupabaseClient,
  input: {
    sourceType: string;
    sourceName?: string;
    sourceUrl?: string;
    authorName?: string;
    authorProfileUrl?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    locationText?: string;
    rawText: string;
    estimatedRevenue?: number;
    notes?: string;
  },
  workspaceKey = 'default',
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const rawText = input.rawText.trim();
  if (!rawText) return { ok: false, error: 'Lead text is required.' };

  const intent = classifyLeadIntent(rawText, input.sourceType);
  const scores = scoreLead(intent, rawText);
  const revenue = input.estimatedRevenue ?? estimateRevenueForIntent(intent);
  const author = input.authorName || input.contactName || null;
  const reply = generateLeadReply({ intent, authorName: author, sourceType: input.sourceType });
  const why = whyTitanFlaggedLead(intent, rawText);
  const now = new Date().toISOString();

  const row = {
    workspace_key: workspaceKey,
    source_type: input.sourceType,
    source_name: input.sourceName ?? null,
    source_url: input.sourceUrl ?? null,
    author_name: author,
    author_profile_url: input.authorProfileUrl ?? null,
    contact_name: input.contactName ?? author,
    phone: input.phone ?? null,
    email: input.email ?? null,
    location_text: input.locationText ?? null,
    raw_text: input.notes ? `${rawText}\n\nNotes: ${input.notes}` : rawText,
    detected_intent: intent,
    service_match: serviceMatchForIntent(intent),
    estimated_revenue: revenue,
    confidence_score: scores.confidence,
    urgency_score: scores.urgency,
    status: 'new',
    recommended_reply: reply,
    why_titan_flagged: why,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await admin.from('titan_lead_radar_items').insert(row).select('id').single();
  if (error) {
    if (isMissingTable(error.message)) return { ok: false, error: 'Apply migration 000101 for Lead Radar.' };
    return { ok: false, error: error.message };
  }

  const id = str((data as { id?: string })?.id);
  if (id) await logRadarEvent(admin, id, 'captured', 'Lead captured', workspaceKey);
  return { ok: true, id };
}

export async function bulkImportLeadText(
  admin: SupabaseClient,
  rawBlock: string,
  sourceType = 'manual',
  workspaceKey = 'default',
): Promise<{ ok: boolean; imported: number; error?: string }> {
  const { splitMessyImportBlock, parseMessySocialText } = await import('@/lib/titan/lead-radar-parse');
  const chunks = splitMessyImportBlock(rawBlock);

  let imported = 0;
  for (const chunk of chunks) {
    const parsed = parseMessySocialText(chunk, sourceType);
    const res = await captureLeadRadarItem(
      admin,
      {
        sourceType: parsed.sourceType,
        sourceName: parsed.sourceName ?? undefined,
        sourceUrl: parsed.sourceUrl ?? undefined,
        authorName: parsed.authorName ?? undefined,
        contactName: parsed.authorName ?? undefined,
        phone: parsed.phone ?? undefined,
        email: parsed.email ?? undefined,
        locationText: parsed.locationText ?? undefined,
        rawText: parsed.rawText,
      },
      workspaceKey,
    );
    if (res.ok) imported += 1;
    else if (res.error && !imported) return { ok: false, imported: 0, error: res.error };
  }
  return { ok: true, imported };
}

export async function updateLeadRadarStatus(
  admin: SupabaseClient,
  id: string,
  status: LeadRadarStatus,
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: now, last_reviewed_at: now };
  const { error } = await admin.from('titan_lead_radar_items').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };
  await logRadarEvent(admin, id, status, notes);
  return { ok: true };
}

export async function scheduleLeadRadarFollowUp(
  admin: SupabaseClient,
  id: string,
  nextFollowUpAt: string,
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from('titan_lead_radar_items')
    .update({ next_follow_up_at: nextFollowUpAt, updated_at: now, status: 'reviewed' })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  await logRadarEvent(admin, id, 'follow_up_scheduled', nextFollowUpAt);
  return { ok: true };
}

function mapPlacesCategoryToIntent(category: string): DetectedIntent {
  const c = category.toLowerCase();
  if (/apartment|rv/.test(c)) return 'apartment_resident_event';
  if (/dealer|dealership/.test(c)) return 'fleet_cleaning';
  if (/fleet|truck|limousine|moving|marina|boat/.test(c)) return 'fleet_cleaning';
  if (/property/.test(c)) return 'apartment_resident_event';
  return 'unknown';
}

const PLACES_DISCOVERY_QUERIES: Array<{ query: string; nearbyType?: string; intent: DetectedIntent; revenue: number }> = [
  { query: 'apartment complex', intent: 'apartment_resident_event', revenue: 3500 },
  { query: 'property management company', intent: 'apartment_resident_event', revenue: 3000 },
  { query: 'used car dealer', nearbyType: 'car_dealer', intent: 'fleet_cleaning', revenue: 2000 },
  { query: 'car dealer', nearbyType: 'car_dealer', intent: 'fleet_cleaning', revenue: 2500 },
  { query: 'fleet service', intent: 'fleet_cleaning', revenue: 4000 },
  { query: 'trucking company', intent: 'fleet_cleaning', revenue: 5000 },
  { query: 'moving company', intent: 'fleet_cleaning', revenue: 1500 },
  { query: 'limousine service', intent: 'fleet_cleaning', revenue: 1800 },
  { query: 'RV park', intent: 'apartment_resident_event', revenue: 1200 },
  { query: 'marina', intent: 'fleet_cleaning', revenue: 2000 },
  { query: 'boat storage', intent: 'fleet_cleaning', revenue: 1500 },
  { query: 'office park', intent: 'fleet_cleaning', revenue: 2200 },
  { query: 'corporate office', intent: 'fleet_cleaning', revenue: 1800 },
];

async function fetchPlaceDetails(placeId: string): Promise<{ rating?: number; reviewCount?: number; mapsUrl: string } | null> {
  const key = getGoogleMapsApiKey();
  if (!key) return null;
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'id,rating,userRatingCount,googleMapsUri',
    },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { rating?: number; userRatingCount?: number; googleMapsUri?: string };
  return {
    rating: data.rating,
    reviewCount: data.userRatingCount,
    mapsUrl: data.googleMapsUri ?? `https://www.google.com/maps/search/?api=1&query_place_id=${placeId}`,
  };
}

export async function runGooglePlacesLeadDiscovery(
  admin: SupabaseClient,
  workspaceKey = 'default',
): Promise<{ ok: boolean; created: number; error?: string; configured: boolean; lastApiError?: string }> {
  if (!getGoogleMapsApiKey()) {
    return { ok: false, created: 0, configured: false, error: 'GOOGLE_PLACES_API_KEY not set.' };
  }
  const coords = businessCoordinates();
  if (!coords) {
    return { ok: false, created: 0, configured: false, error: 'BUSINESS_LAT and BUSINESS_LNG not set (defaults to Austin if omitted in env).' };
  }
  const center = coords;

  let created = 0;
  let lastApiError: string | undefined;

  for (const q of PLACES_DISCOVERY_QUERIES) {
    const search = q.nearbyType
      ? await searchNearbyPlaces({ center, radiusMeters: 25000, includedType: q.nearbyType, maxResults: 5 })
      : await searchTextPlaces({ query: `${q.query} Austin TX`, center, radiusMeters: 35000, maxResults: 5 });

    if (!search.ok) {
      lastApiError = search.error;
      continue;
    }

    for (const place of search.places) {
      const fingerprint = `google_places:${place.placeId}`;
      const { data: existing } = await admin
        .from('titan_lead_radar_items')
        .select('id')
        .eq('workspace_key', workspaceKey)
        .eq('source_type', 'google_places')
        .ilike('raw_text', `%${place.placeId}%`)
        .maybeSingle();
      if (!existing?.id) {
        const byName = await admin
          .from('titan_lead_radar_items')
          .select('id')
          .eq('workspace_key', workspaceKey)
          .eq('source_type', 'google_places')
          .eq('source_name', place.name)
          .maybeSingle();
        if (byName.data?.id) continue;
      } else continue;

      const details = await fetchPlaceDetails(place.placeId);
      const intent = mapPlacesCategoryToIntent(q.query);
      const ratingLine = details?.rating ? ` · ${details.rating}★ (${details.reviewCount ?? 0} reviews)` : '';
      const rawText = `[${place.placeId}] ${place.name} — ${place.address ?? 'Austin area'} (${q.query})${ratingLine}${place.website ? ` · ${place.website}` : ''}`;
      const reply = generateLeadReply({ intent, authorName: place.name, sourceType: 'google_places' });
      const mapsUrl = details?.mapsUrl ?? place.website ?? fingerprint;
      const now = new Date().toISOString();

      const { error } = await admin.from('titan_lead_radar_items').insert({
        workspace_key: workspaceKey,
        source_type: 'google_places',
        source_name: place.name,
        source_url: mapsUrl.startsWith('http') ? mapsUrl : fingerprint,
        author_name: place.name,
        author_profile_url: place.website,
        location_text: place.address,
        raw_text: rawText,
        detected_intent: intent,
        service_match: serviceMatchForIntent(intent),
        estimated_revenue: q.revenue,
        confidence_score: details?.rating && details.rating >= 4 ? 62 : 55,
        urgency_score: 35,
        status: 'new',
        recommended_reply: reply,
        why_titan_flagged: `Google Places: "${q.query}" prospect${ratingLine ? ' with strong reviews' : ''} — B2B outreach target near service area.`,
        phone: place.phone,
        email: null,
        created_at: now,
        updated_at: now,
      });

      if (!error) {
        created += 1;
        const { data: row } = await admin.from('titan_lead_radar_items').select('id').eq('source_url', fingerprint).maybeSingle();
        if (!row?.id) {
          const { data: latest } = await admin.from('titan_lead_radar_items').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (latest?.id) await logRadarEvent(admin, str((latest as { id: string }).id), 'google_places_import', place.name, workspaceKey);
        } else {
          await logRadarEvent(admin, str((row as { id: string }).id), 'google_places_import', place.name, workspaceKey);
        }
      } else if (!lastApiError) {
        lastApiError = error.message;
      }
    }
  }

  if (created === 0 && lastApiError) {
    return { ok: false, created: 0, configured: true, error: lastApiError, lastApiError };
  }

  return { ok: true, created, configured: true, lastApiError };
}
export function leadRadarPlacesConfigured(): boolean {
  return Boolean(getGoogleMapsApiKey());
}

export async function convertLeadToOpportunity(
  admin: SupabaseClient,
  itemId: string,
  workspaceKey = 'default',
): Promise<{ ok: boolean; opportunityId?: string; error?: string }> {
  const { data: row, error: loadErr } = await admin.from('titan_lead_radar_items').select('*').eq('id', itemId).maybeSingle();
  if (loadErr || !row) return { ok: false, error: loadErr?.message ?? 'Lead not found' };

  const item = rowToItem(row as Record<string, unknown>);
  if (item.opportunityId) return { ok: true, opportunityId: item.opportunityId };

  const oppType =
    item.detectedIntent === 'fleet_cleaning'
      ? 'fleet'
      : item.detectedIntent === 'apartment_resident_event'
        ? 'apartment_hoa'
        : item.sourceType === 'referral' || item.sourceType === 'coworker_nurse'
          ? 'warm_lead'
          : 'manual_prospect';

  const title = `${INTENT_LABELS[item.detectedIntent] ?? 'Lead'} — ${item.sourceName ?? item.authorName ?? 'Lead Radar'}`;
  const notes = [item.rawText, item.sourceUrl ? `Source: ${item.sourceUrl}` : ''].filter(Boolean).join('\n\n');

  const created = await createRevenueOpportunity(
    admin,
    {
      title,
      opportunityType: oppType,
      estimatedRevenueCents: Math.round(item.estimatedRevenue * 100),
      contactName: item.contactName ?? item.authorName ?? undefined,
      contactPhone: item.phone ?? undefined,
      contactEmail: item.email ?? undefined,
      socialUrl: item.authorProfileUrl ?? item.sourceUrl ?? undefined,
      notes,
      recommendedAction: item.recommendedReply.slice(0, 120),
      source: SOURCE_TYPE_LABELS[item.sourceType] ?? item.sourceType,
      confidenceScore: item.confidenceScore,
      whySurfaced: item.whyTitanFlagged,
    },
    workspaceKey,
  );

  if (!created.ok || !created.id) return { ok: false, error: created.error };

  await admin
    .from('titan_lead_radar_items')
    .update({
      opportunity_id: created.id,
      status: 'converted_to_opportunity',
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  await logRadarEvent(admin, itemId, 'converted_to_opportunity', created.id, workspaceKey);
  return { ok: true, opportunityId: created.id };
}

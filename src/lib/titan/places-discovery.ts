import type { SupabaseClient } from '@supabase/supabase-js';
import { businessCoordinates } from '@/lib/weather-config';
import { getBusinessHomeBaseAddress } from '@/lib/business-location';
import {
  geocodeAddress,
  haversineMiles,
  placesApiConfigured,
  searchNearbyPlaces,
  searchTextPlaces,
  type GeoPoint,
  type PlaceResult,
} from '@/lib/google/places-client';
import {
  buildScoreReason,
  computeScore,
  estimateMonthlyCents,
  type ProspectType,
} from '@/lib/titan/lead-radar';
import { loadTitanWorkspace, workspaceDiscoveryRadiusMiles } from '@/lib/titan/workspace';
import { logTitanActivity } from '@/lib/titan/activity-feed';

export type DiscoveryByType = Partial<Record<ProspectType, number>>;

export type PlacesDiscoveryResult = {
  configured: boolean;
  skipped: boolean;
  discovered: number;
  newCount: number;
  byType: DiscoveryByType;
  newByType: DiscoveryByType;
  potentialMonthlyCents: number;
  radiusMiles: number;
  center: GeoPoint | null;
  error?: string;
};

export type DiscoverySummary = {
  configured: boolean;
  lastRunAt: string | null;
  radiusMiles: number;
  discovered: number;
  newToday: number;
  byType: DiscoveryByType;
  newByType: DiscoveryByType;
  potentialMonthlyCents: number;
  lastError: string | null;
};

const DEFAULT_RADIUS_MILES = Number(process.env.TITAN_DISCOVERY_RADIUS_MILES ?? 15);

const CONTACT_ROLES: Record<ProspectType, string> = {
  apartment_complex: 'Property Manager',
  dealership: 'General Manager',
  fleet_operator: 'Fleet Manager',
  construction: 'Project Manager',
  landscaping: 'Operations Manager',
  property_manager: 'Property Manager',
  hoa: 'HOA Manager',
  realtor: 'Broker / Office Manager',
  other: 'Decision Maker',
};

type DiscoveryQuery = {
  prospectType: ProspectType;
  mode: 'nearby' | 'text';
  nearbyType?: string;
  textQuery?: string;
};

const DISCOVERY_QUERIES: DiscoveryQuery[] = [
  { prospectType: 'apartment_complex', mode: 'text', textQuery: 'apartment complex' },
  { prospectType: 'dealership', mode: 'nearby', nearbyType: 'car_dealer' },
  { prospectType: 'fleet_operator', mode: 'text', textQuery: 'commercial fleet services' },
  { prospectType: 'landscaping', mode: 'nearby', nearbyType: 'landscaping' },
  { prospectType: 'construction', mode: 'nearby', nearbyType: 'general_contractor' },
  { prospectType: 'property_manager', mode: 'text', textQuery: 'property management company' },
  { prospectType: 'hoa', mode: 'text', textQuery: 'homeowners association management' },
  { prospectType: 'realtor', mode: 'nearby', nearbyType: 'real_estate_agency' },
];

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function isMissingTable(message: string) {
  return /titan_prospect|titan_discovery|schema cache|does not exist/i.test(message);
}

function milesToMeters(miles: number) {
  return Math.round(miles * 1609.34);
}

async function resolveServiceCenter(): Promise<{ ok: true; point: GeoPoint } | { ok: false; error: string }> {
  const coords = businessCoordinates();
  if (coords) return { ok: true, point: coords };

  const address = getBusinessHomeBaseAddress();
  return geocodeAddress(address);
}

function mapPlaceType(place: PlaceResult, forcedType: ProspectType): ProspectType {
  const hay = `${place.name} ${place.types.join(' ')}`.toLowerCase();
  if (/apartment|multifamily|resident/.test(hay)) return 'apartment_complex';
  if (/dealer|dealership/.test(hay)) return 'dealership';
  if (/fleet|truck|logistics/.test(hay)) return 'fleet_operator';
  if (/landscap|lawn/.test(hay)) return 'landscaping';
  if (/construct|contractor|builder/.test(hay)) return 'construction';
  if (/property manage/.test(hay)) return 'property_manager';
  if (/hoa|homeowner/.test(hay)) return 'hoa';
  if (/realtor|real estate|broker/.test(hay)) return 'realtor';
  return forcedType;
}

export async function discoverPlacesProspects(
  admin: SupabaseClient,
  options?: { radiusMiles?: number },
): Promise<PlacesDiscoveryResult> {
  const workspace = await loadTitanWorkspace(admin);
  const radiusMiles = options?.radiusMiles ?? workspaceDiscoveryRadiusMiles(workspace);
  const empty: PlacesDiscoveryResult = {
    configured: placesApiConfigured(),
    skipped: false,
    discovered: 0,
    newCount: 0,
    byType: {},
    newByType: {},
    potentialMonthlyCents: 0,
    radiusMiles,
    center: null,
  };

  if (!placesApiConfigured()) {
    return { ...empty, skipped: true, error: 'Configure GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY' };
  }

  const probe = await admin.from('titan_prospects').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) {
    return { ...empty, skipped: true, error: 'Apply migration 000088' };
  }

  const runProbe = await admin.from('titan_discovery_runs').select('id').limit(1);
  if (runProbe.error && isMissingTable(runProbe.error.message)) {
    return { ...empty, skipped: true, error: 'Apply migration 000089' };
  }

  const centerRes = await resolveServiceCenter();
  if (!centerRes.ok) {
    return { ...empty, error: centerRes.error };
  }

  const center = centerRes.point;
  const radiusMeters = milesToMeters(radiusMiles);
  const startedAt = new Date().toISOString();
  const { data: runRow } = await admin
    .from('titan_discovery_runs')
    .insert({ started_at: startedAt, radius_miles: radiusMiles, center_lat: center.lat, center_lng: center.lng })
    .select('id')
    .maybeSingle();

  const seenPlaceIds = new Set<string>();
  const byType: DiscoveryByType = {};
  const newByType: DiscoveryByType = {};
  let discovered = 0;
  let newCount = 0;
  let potentialMonthlyCents = 0;
  let lastError: string | undefined;

  try {
    for (const query of DISCOVERY_QUERIES) {
      const result =
        query.mode === 'nearby' && query.nearbyType
          ? await searchNearbyPlaces({ center, radiusMeters, includedType: query.nearbyType })
          : await searchTextPlaces({ center, radiusMeters, query: query.textQuery ?? query.prospectType });

      if (!result.ok) {
        lastError = result.error;
        continue;
      }

      for (const place of result.places) {
        if (seenPlaceIds.has(place.placeId)) continue;
        seenPlaceIds.add(place.placeId);

        const distance = haversineMiles(center, { lat: place.lat, lng: place.lng });
        if (distance > radiusMiles) continue;

        const prospectType = mapPlaceType(place, query.prospectType);
        const monthly = estimateMonthlyCents(prospectType, null);
        byType[prospectType] = (byType[prospectType] ?? 0) + 1;
        discovered += 1;
        potentialMonthlyCents += monthly;

        const { data: existing } = await admin
          .from('titan_prospects')
          .select('id')
          .eq('google_place_id', place.placeId)
          .maybeSingle();

        if (existing?.id) continue;

        const score = computeScore(prospectType, monthly, distance, 'new');
        const now = new Date().toISOString();

        const { error } = await admin.from('titan_prospects').insert({
          company_name: place.name,
          prospect_type: prospectType,
          contact_role: CONTACT_ROLES[prospectType],
          phone: place.phone,
          website: place.website,
          address: place.address,
          distance_miles: distance,
          lat: place.lat,
          lng: place.lng,
          google_place_id: place.placeId,
          estimated_monthly_cents: monthly,
          score,
          score_reason: buildScoreReason(prospectType, null, distance),
          status: 'new',
          source: 'places_api',
          discovered_at: now,
          created_at: now,
          updated_at: now,
        });

        if (!error) {
          newCount += 1;
          newByType[prospectType] = (newByType[prospectType] ?? 0) + 1;
        }
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    if (runRow?.id) {
      await admin
        .from('titan_discovery_runs')
        .update({
          finished_at: new Date().toISOString(),
          discovered_count: discovered,
          new_count: newCount,
          by_type: byType,
          new_by_type: newByType,
          potential_monthly_cents: potentialMonthlyCents,
          error_message: lastError ?? null,
        })
        .eq('id', runRow.id);
    }

    if (newCount > 0) {
      await logTitanActivity(admin, {
        kind: 'prospect_discovered',
        title: 'Lead Radar found new opportunities',
        detail: `${newCount} new · ${discovered} total within ${radiusMiles} miles`,
        impactCents: potentialMonthlyCents,
        href: '/admin/super',
      });
    }

    return {
      configured: true,
      skipped: false,
      discovered,
      newCount,
      byType,
      newByType,
      potentialMonthlyCents,
      radiusMiles,
      center,
      error: lastError,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Places discovery failed';
    if (runRow?.id) {
      await admin
        .from('titan_discovery_runs')
        .update({ finished_at: new Date().toISOString(), error_message: message })
        .eq('id', runRow.id);
    }
    return { ...empty, center, error: message };
  }
}

export async function loadDiscoverySummary(admin: SupabaseClient): Promise<DiscoverySummary> {
  const base: DiscoverySummary = {
    configured: placesApiConfigured(),
    lastRunAt: null,
    radiusMiles: DEFAULT_RADIUS_MILES,
    discovered: 0,
    newToday: 0,
    byType: {},
    newByType: {},
    potentialMonthlyCents: 0,
    lastError: null,
  };

  const probe = await admin.from('titan_discovery_runs').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) return base;

  const { data: lastRun } = await admin
    .from('titan_discovery_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastRun) return base;

  const r = lastRun as Record<string, unknown>;
  return {
    configured: placesApiConfigured(),
    lastRunAt: str(r.started_at) || null,
    radiusMiles: Number(r.radius_miles ?? DEFAULT_RADIUS_MILES),
    discovered: Number(r.discovered_count ?? 0),
    newToday: Number(r.new_count ?? 0),
    byType: (r.by_type as DiscoveryByType) ?? {},
    newByType: (r.new_by_type as DiscoveryByType) ?? {},
    potentialMonthlyCents: Number(r.potential_monthly_cents ?? 0),
    lastError: str(r.error_message) || null,
  };
}

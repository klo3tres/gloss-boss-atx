/**
 * Maps & Discovery integration status — Google Places, Google Maps, Apple MapKit.
 * Places is REQUIRED for Titan Lead Radar discovery (not optional).
 */

import { businessCoordinates } from '@/lib/weather-config';

export type IntegrationConnectionStatus =
  | 'connected'
  | 'missing'
  | 'invalid_key'
  | 'billing_not_enabled'
  | 'api_not_enabled'
  | 'manual';

export type IntegrationProbe = {
  id: string;
  label: string;
  status: IntegrationConnectionStatus;
  envKeys: string[];
  presentKeys: string[];
  missingKeys: string[];
  affects: string[];
  disabledFeatures: string[];
  fix: string;
  required: boolean;
};

export type MapProviderId = 'google_maps' | 'apple_mapkit' | 'list_only';

export function getGooglePlacesApiKey(): string | null {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return key || null;
}

export function getGoogleMapsPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key || null;
}

export function getGoogleMapsServerKey(): string | null {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    null
  );
}

export function getAppleMapKitJsToken(): string | null {
  return process.env.APPLE_MAPKIT_JS_TOKEN?.trim() || null;
}

export function appleMapKitCredentialsPresent(): boolean {
  const hasToken = Boolean(getAppleMapKitJsToken());
  const hasSigning =
    Boolean(process.env.APPLE_MAPS_TEAM_ID?.trim()) &&
    Boolean(process.env.APPLE_MAPS_KEY_ID?.trim()) &&
    Boolean(process.env.APPLE_MAPS_PRIVATE_KEY?.trim());
  return hasToken || hasSigning;
}

/** Lead Radar discovery — requires Places API key (server). */
export function placesDiscoveryConfigured(): boolean {
  return Boolean(getGooglePlacesApiKey() || getGoogleMapsServerKey());
}

export function googleMapsRenderConfigured(): boolean {
  return Boolean(getGoogleMapsPublicKey() || getGoogleMapsServerKey());
}

function classifyGoogleError(message: string): IntegrationConnectionStatus {
  const m = message.toLowerCase();
  if (/billing|payment|enable billing/i.test(m)) return 'billing_not_enabled';
  if (/not enabled|api has not been used|access not configured|permission/i.test(m)) return 'api_not_enabled';
  if (/invalid|denied|request_denied|api key/i.test(m)) return 'invalid_key';
  return 'invalid_key';
}

export async function probeGooglePlacesSearch(): Promise<{
  status: IntegrationConnectionStatus;
  detail: string;
  resultCount?: number;
}> {
  const key = getGooglePlacesApiKey() ?? getGoogleMapsServerKey();
  if (!key) {
    return {
      status: 'missing',
      detail: 'GOOGLE_PLACES_API_KEY is not set. Lead Radar discovery is disabled.',
    };
  }

  const coords = businessCoordinates();
  if (!coords) {
    return {
      status: 'missing',
      detail: 'Set BUSINESS_LAT and BUSINESS_LNG for discovery test center.',
    };
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName',
      },
      body: JSON.stringify({
        includedTypes: ['car_dealer'],
        maxResultCount: 3,
        locationRestriction: {
          circle: {
            center: { latitude: coords.lat, longitude: coords.lng },
            radius: 5000,
          },
        },
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      return { status: classifyGoogleError(text), detail: text.slice(0, 200) };
    }

    const data = JSON.parse(text) as { places?: unknown[] };
    return {
      status: 'connected',
      detail: `Places API responded — ${data.places?.length ?? 0} results near business center.`,
      resultCount: data.places?.length ?? 0,
    };
  } catch (e) {
    return { status: 'invalid_key', detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function probeGoogleMapsGeocode(): Promise<{ status: IntegrationConnectionStatus; detail: string }> {
  const key = getGoogleMapsPublicKey() ?? getGoogleMapsServerKey();
  if (!key) {
    return {
      status: 'missing',
      detail: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY missing — map view disabled.',
    };
  }

  const coords = businessCoordinates();
  const lat = coords?.lat ?? 30.2672;
  const lng = coords?.lng ?? -97.7431;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
    const res = await fetch(url);
    const data = (await res.json()) as { status?: string; error_message?: string };
    if (data.status === 'OK') {
      return { status: 'connected', detail: 'Google Maps Geocode API OK — map render available.' };
    }
    return {
      status: classifyGoogleError(data.error_message ?? data.status ?? ''),
      detail: data.error_message ?? data.status ?? 'Geocode failed',
    };
  } catch (e) {
    return { status: 'invalid_key', detail: e instanceof Error ? e.message : String(e) };
  }
}

export function probeAppleMapKitStatic(): { status: IntegrationConnectionStatus; detail: string } {
  if (getAppleMapKitJsToken()) {
    return { status: 'connected', detail: 'APPLE_MAPKIT_JS_TOKEN present — MapKit JS render available.' };
  }
  const team = process.env.APPLE_MAPS_TEAM_ID?.trim();
  const keyId = process.env.APPLE_MAPS_KEY_ID?.trim();
  const pk = process.env.APPLE_MAPS_PRIVATE_KEY?.trim();
  if (team && keyId && pk) {
    return {
      status: 'connected',
      detail: 'Apple Maps signing credentials present — generate MapKit JS token at runtime.',
    };
  }
  const missing = [
    !team ? 'APPLE_MAPS_TEAM_ID' : null,
    !keyId ? 'APPLE_MAPS_KEY_ID' : null,
    !pk ? 'APPLE_MAPS_PRIVATE_KEY' : null,
  ].filter(Boolean);
  return {
    status: 'missing',
    detail: `Apple MapKit optional — missing: ${missing.join(', ') || 'APPLE_MAPKIT_JS_TOKEN'}`,
  };
}

export function buildMapsDiscoveryProbes(): IntegrationProbe[] {
  const placesKey = getGooglePlacesApiKey();

  return [
    {
      id: 'google_places',
      label: 'Google Places API',
      status: placesKey || getGoogleMapsServerKey() ? 'connected' : 'missing',
      envKeys: ['GOOGLE_PLACES_API_KEY'],
      presentKeys: [placesKey ? 'GOOGLE_PLACES_API_KEY' : getGoogleMapsServerKey() ? 'GOOGLE_MAPS_API_KEY (fallback)' : ''].filter(Boolean),
      missingKeys: placesDiscoveryConfigured() ? [] : ['GOOGLE_PLACES_API_KEY'],
      affects: ['Titan Lead Radar discovery', 'Automatic B2B prospect scan', 'Nightly Titan cron discovery'],
      disabledFeatures: placesDiscoveryConfigured()
        ? []
        : ['Lead Radar auto-discovery', 'Run discovery now', 'Places-sourced prospects'],
      fix: 'Enable Places API (New) in Google Cloud. Set GOOGLE_PLACES_API_KEY with billing enabled.',
      required: true,
    },
    {
      id: 'google_maps',
      label: 'Google Maps (map view)',
      status: getGoogleMapsPublicKey() || getGoogleMapsServerKey() ? 'connected' : 'missing',
      envKeys: ['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'],
      presentKeys: [getGoogleMapsPublicKey() ? 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY' : getGoogleMapsServerKey() ? 'server key fallback' : ''].filter(Boolean),
      missingKeys: googleMapsRenderConfigured() ? [] : ['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'],
      affects: ['Lead Radar map view', 'Routing preview', 'Territory map overlay'],
      disabledFeatures: googleMapsRenderConfigured() ? [] : ['Map view in Lead Radar', 'Google map toggle'],
      fix: 'Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and enable Maps JavaScript API.',
      required: true,
    },
    {
      id: 'apple_mapkit',
      label: 'Apple MapKit JS',
      status: appleMapKitCredentialsPresent() ? 'connected' : 'missing',
      envKeys: ['APPLE_MAPKIT_JS_TOKEN', 'APPLE_MAPS_TEAM_ID', 'APPLE_MAPS_KEY_ID', 'APPLE_MAPS_PRIVATE_KEY'],
      presentKeys: [
        getAppleMapKitJsToken() ? 'APPLE_MAPKIT_JS_TOKEN' : null,
        process.env.APPLE_MAPS_TEAM_ID?.trim() ? 'APPLE_MAPS_TEAM_ID' : null,
        process.env.APPLE_MAPS_KEY_ID?.trim() ? 'APPLE_MAPS_KEY_ID' : null,
        process.env.APPLE_MAPS_PRIVATE_KEY?.trim() ? 'APPLE_MAPS_PRIVATE_KEY' : null,
      ].filter((x): x is string => Boolean(x)),
      missingKeys: appleMapKitCredentialsPresent() ? [] : ['APPLE_MAPKIT_JS_TOKEN or signing trio'],
      affects: ['Alternative map visual layer in Lead Radar'],
      disabledFeatures: appleMapKitCredentialsPresent() ? [] : ['Apple map toggle'],
      fix: 'Optional — Apple Developer MapKit JS token. Does not replace Google Places discovery.',
      required: false,
    },
  ];
}

export function resolveMapProvider(preference: MapProviderId | string | null | undefined): MapProviderId {
  if (preference === 'google_maps' && googleMapsRenderConfigured()) return 'google_maps';
  if (preference === 'apple_mapkit' && appleMapKitCredentialsPresent()) return 'apple_mapkit';
  return 'list_only';
}

export function leadRadarDiscoveryMessage(): string {
  if (placesDiscoveryConfigured()) {
    return 'Google Places connected — discovery scans apartments, dealerships, fleets, and more within your radius.';
  }
  return 'Discovery disabled until Google Places API is connected. Manual prospect entry still works.';
}

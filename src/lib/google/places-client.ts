/** Google Maps / Places API key resolution (server-only). */

export function getGoogleMapsApiKey(): string | null {
  const key =
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key || null;
}

export function placesApiConfigured(): boolean {
  return Boolean(getGoogleMapsApiKey());
}

export type GeoPoint = { lat: number; lng: number };

export async function geocodeAddress(address: string): Promise<{ ok: true; point: GeoPoint } | { ok: false; error: string }> {
  const key = getGoogleMapsApiKey();
  if (!key) return { ok: false, error: 'Google Maps API key not configured' };

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', key);

  const res = await fetch(url.toString(), { next: { revalidate: 86400 } });
  if (!res.ok) return { ok: false, error: `Geocode failed (${res.status})` };

  const data = (await res.json()) as {
    status?: string;
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
  };

  if (data.status !== 'OK' || !data.results?.[0]?.geometry?.location) {
    return { ok: false, error: data.status ?? 'Geocode returned no results' };
  }

  const lat = Number(data.results[0].geometry.location.lat);
  const lng = Number(data.results[0].geometry.location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: 'Invalid geocode coordinates' };
  }

  return { ok: true, point: { lat, lng } };
}

export type PlaceResult = {
  placeId: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  types: string[];
};

const PLACE_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.nationalPhoneNumber',
  'places.types',
].join(',');

function mapPlace(row: Record<string, unknown>): PlaceResult | null {
  const placeId = String(row.id ?? '').trim();
  const displayName = row.displayName as { text?: string } | undefined;
  const name = String(displayName?.text ?? '').trim();
  const location = row.location as { latitude?: number; longitude?: number } | undefined;
  const lat = Number(location?.latitude);
  const lng = Number(location?.longitude);
  if (!placeId || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    placeId,
    name,
    address: row.formattedAddress ? String(row.formattedAddress) : null,
    phone: row.nationalPhoneNumber ? String(row.nationalPhoneNumber) : null,
    lat,
    lng,
    types: Array.isArray(row.types) ? row.types.map((t) => String(t)) : [],
  };
}

async function postPlaces(
  endpoint: 'searchNearby' | 'searchText',
  body: Record<string, unknown>,
): Promise<{ ok: true; places: PlaceResult[] } | { ok: false; error: string }> {
  const key = getGoogleMapsApiKey();
  if (!key) return { ok: false, error: 'Google Places API key not configured' };

  const res = await fetch(`https://places.googleapis.com/v1/places:${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': PLACE_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `Places ${endpoint} failed (${res.status})${text ? `: ${text.slice(0, 120)}` : ''}` };
  }

  const data = (await res.json()) as { places?: Array<Record<string, unknown>> };
  const places = (data.places ?? []).map((p) => mapPlace(p)).filter((p): p is PlaceResult => Boolean(p));
  return { ok: true, places };
}

export async function searchNearbyPlaces(input: {
  center: GeoPoint;
  radiusMeters: number;
  includedType: string;
  maxResults?: number;
}) {
  return postPlaces('searchNearby', {
    includedTypes: [input.includedType],
    maxResultCount: Math.min(20, input.maxResults ?? 20),
    locationRestriction: {
      circle: {
        center: { latitude: input.center.lat, longitude: input.center.lng },
        radius: input.radiusMeters,
      },
    },
  });
}

export async function searchTextPlaces(input: {
  query: string;
  center: GeoPoint;
  radiusMeters: number;
  maxResults?: number;
}) {
  return postPlaces('searchText', {
    textQuery: input.query,
    maxResultCount: Math.min(20, input.maxResults ?? 20),
    locationBias: {
      circle: {
        center: { latitude: input.center.lat, longitude: input.center.lng },
        radius: input.radiusMeters,
      },
    },
  });
}

export function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sin =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(sin), Math.sqrt(1 - sin)) * 10) / 10;
}

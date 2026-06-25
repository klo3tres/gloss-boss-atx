/**
 * Fetch Google Business reviews via Places API (New) and sync into customer_reviews.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getGoogleMapsApiKey, searchTextPlaces, type GeoPoint } from '@/lib/google/places-client';
import { businessCoordinates } from '@/lib/weather-config';

const AUSTIN_CENTER: GeoPoint = { lat: 30.2672, lng: -97.7431 };

export type GooglePlaceReview = {
  googleReviewId: string;
  authorName: string;
  rating: number;
  text: string;
  publishedAt: string;
};

export type SyncGoogleReviewsResult = {
  ok: boolean;
  imported: number;
  updated: number;
  skipped: number;
  totalFromGoogle: number;
  placeId?: string;
  error?: string;
};

const AUTO_SYNC_COOLDOWN_MS = 60 * 60 * 1000;
const DEFAULT_BUSINESS_QUERY = 'Gloss Boss ATX mobile detailing Austin TX';

function normalizePlaceId(id: string): string {
  return id.trim().replace(/^places\//, '');
}

export function getConfiguredGooglePlaceId(): string | null {
  const fromEnv = process.env.GOOGLE_PLACE_ID?.trim();
  if (fromEnv) return normalizePlaceId(fromEnv);
  return null;
}

async function resolvePlaceIdFromSearch(query = DEFAULT_BUSINESS_QUERY): Promise<{ ok: true; placeId: string } | { ok: false; error: string }> {
  const center = businessCoordinates() ?? AUSTIN_CENTER;
  const search = await searchTextPlaces({
    query,
    center,
    radiusMeters: 40000,
    maxResults: 5,
  });
  if (!search.ok) return search;
  const match =
    search.places.find((p) => /gloss\s*boss/i.test(p.name)) ??
    search.places.find((p) => /detail/i.test(p.name)) ??
    search.places[0];
  if (!match?.placeId) return { ok: false, error: 'No matching Google Business place found for Gloss Boss ATX.' };
  return { ok: true, placeId: match.placeId };
}

function mapReviewRow(row: Record<string, unknown>): GooglePlaceReview | null {
  const name = String(row.name ?? '').trim();
  const rating = Math.max(1, Math.min(5, Math.round(Number(row.rating ?? 5))));
  const textObj = row.text as { text?: string } | undefined;
  const original = row.originalText as { text?: string } | undefined;
  const text = String(textObj?.text ?? original?.text ?? '').trim();
  const author = row.authorAttribution as { displayName?: string } | undefined;
  const authorName = String(author?.displayName ?? 'Google reviewer').trim() || 'Google reviewer';
  const publishedAt = String(row.publishTime ?? new Date().toISOString());
  const googleReviewId = name || `${authorName}:${publishedAt}:${rating}`;

  if (!text) return null;

  return { googleReviewId, authorName, rating, text, publishedAt };
}

export async function fetchGooglePlaceReviews(placeIdInput?: string): Promise<
  | { ok: true; reviews: GooglePlaceReview[]; placeId: string; rating?: number; reviewCount?: number }
  | { ok: false; error: string }
> {
  const key = getGoogleMapsApiKey();
  if (!key) return { ok: false, error: 'Google Places API key not configured (GOOGLE_PLACES_API_KEY).' };

  let placeId = placeIdInput?.trim() ? normalizePlaceId(placeIdInput) : getConfiguredGooglePlaceId();
  if (!placeId) {
    const resolved = await resolvePlaceIdFromSearch();
    if (!resolved.ok) return resolved;
    placeId = resolved.placeId;
  }

  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'reviews,rating,userRatingCount',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 404) {
      const resolved = await resolvePlaceIdFromSearch();
      if (resolved.ok && resolved.placeId !== placeId) {
        return fetchGooglePlaceReviews(resolved.placeId);
      }
    }
    return {
      ok: false,
      error: `Places details failed (${res.status})${body ? `: ${body.slice(0, 180)}` : ''}`,
    };
  }

  const data = (await res.json()) as {
    reviews?: Array<Record<string, unknown>>;
    rating?: number;
    userRatingCount?: number;
  };

  const reviews = (data.reviews ?? []).map((r) => mapReviewRow(r)).filter((r): r is GooglePlaceReview => Boolean(r));

  return {
    ok: true,
    placeId,
    reviews,
    rating: data.rating,
    reviewCount: data.userRatingCount,
  };
}

function isGoogleReviewIdColumnError(message: string) {
  return /google_review_id|column .* does not exist|schema cache|Could not find/i.test(message);
}

async function findExistingReview(
  admin: SupabaseClient,
  review: GooglePlaceReview,
): Promise<string | null> {
  const byId = await admin.from('customer_reviews').select('id').eq('google_review_id', review.googleReviewId).maybeSingle();
  if (!byId.error && byId.data?.id) return String(byId.data.id);
  if (byId.error && !isGoogleReviewIdColumnError(byId.error.message)) {
    console.warn('[google-reviews] lookup by google_review_id', byId.error.message);
  }

  const byText = await admin
    .from('customer_reviews')
    .select('id')
    .eq('source', 'google')
    .eq('customer_name', review.authorName)
    .eq('testimonial', review.text)
    .maybeSingle();
  if (!byText.error && byText.data?.id) return String(byText.data.id);
  return null;
}

export async function syncGoogleReviewsToDatabase(
  admin: SupabaseClient,
  options?: { placeId?: string; minRating?: number },
): Promise<SyncGoogleReviewsResult> {
  const fetched = await fetchGooglePlaceReviews(options?.placeId);
  if (!fetched.ok) {
    return { ok: false, imported: 0, updated: 0, skipped: 0, totalFromGoogle: 0, error: fetched.error };
  }

  const minRating = options?.minRating ?? 1;
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const review of fetched.reviews) {
    if (review.rating < minRating) {
      skipped += 1;
      continue;
    }

    const existingId = await findExistingReview(admin, review);
    const row: Record<string, unknown> = {
      customer_name: review.authorName,
      rating: review.rating,
      testimonial: review.text,
      review_text: review.text,
      service_label: 'Google review',
      source: 'google',
      published: true,
      featured: review.rating >= 5,
      approved_at: review.publishedAt,
      created_at: review.publishedAt,
      updated_at: now,
      google_review_id: review.googleReviewId,
    };

    if (existingId) {
      const { error } = await admin.from('customer_reviews').update(row).eq('id', existingId);
      if (error && isGoogleReviewIdColumnError(error.message)) {
        const { google_review_id: _drop, ...fallback } = row;
        const retry = await admin.from('customer_reviews').update(fallback).eq('id', existingId);
        if (retry.error) {
          return { ok: false, imported, updated, skipped, totalFromGoogle: fetched.reviews.length, placeId: fetched.placeId, error: retry.error.message };
        }
      } else if (error) {
        return { ok: false, imported, updated, skipped, totalFromGoogle: fetched.reviews.length, placeId: fetched.placeId, error: error.message };
      }
      updated += 1;
    } else {
      const { error } = await admin.from('customer_reviews').insert(row);
      if (error && isGoogleReviewIdColumnError(error.message)) {
        const { google_review_id: _drop, ...fallback } = row;
        const retry = await admin.from('customer_reviews').insert(fallback);
        if (retry.error) {
          return { ok: false, imported, updated, skipped, totalFromGoogle: fetched.reviews.length, placeId: fetched.placeId, error: retry.error.message };
        }
      } else if (error) {
        return { ok: false, imported, updated, skipped, totalFromGoogle: fetched.reviews.length, placeId: fetched.placeId, error: error.message };
      }
      imported += 1;
    }
  }

  await admin.from('site_settings').upsert(
    {
      key: 'google_reviews_last_sync_at',
      value: JSON.stringify(now),
      updated_at: now,
    },
    { onConflict: 'key' },
  );

  if (fetched.placeId) {
    await admin.from('site_settings').upsert(
      {
        key: 'google_place_id',
        value: JSON.stringify({ placeId: fetched.placeId }),
        updated_at: now,
      },
      { onConflict: 'key' },
    );
  }

  return {
    ok: true,
    imported,
    updated,
    skipped,
    totalFromGoogle: fetched.reviews.length,
    placeId: fetched.placeId,
  };
}

export async function maybeAutoSyncGoogleReviews(admin: SupabaseClient): Promise<{ ran: boolean; result?: SyncGoogleReviewsResult }> {
  if (!getGoogleMapsApiKey()) return { ran: false };

  const [{ count: publishedCount }, lastSyncRow] = await Promise.all([
    admin.from('customer_reviews').select('id', { count: 'exact', head: true }).eq('published', true),
    admin.from('site_settings').select('value').eq('key', 'google_reviews_last_sync_at').maybeSingle(),
  ]);

  let lastMs = 0;
  const rawLast = lastSyncRow.data?.value;
  if (rawLast != null) {
    try {
      const parsed = typeof rawLast === 'string' && rawLast.startsWith('"') ? JSON.parse(rawLast) : String(rawLast);
      lastMs = Date.parse(parsed);
    } catch {
      lastMs = 0;
    }
  }

  const needsReviews = !publishedCount || publishedCount === 0;
  const cooldownExpired = !lastMs || Date.now() - lastMs >= AUTO_SYNC_COOLDOWN_MS;
  if (!needsReviews && !cooldownExpired) return { ran: false };
  if (!needsReviews && cooldownExpired) {
    const { count: googleCount } = await admin
      .from('customer_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'google');
    if (googleCount && googleCount > 0) return { ran: false };
  }

  const result = await syncGoogleReviewsToDatabase(admin);
  return { ran: true, result };
}

export async function probeGooglePlaceReviews(): Promise<{ status: 'connected' | 'missing' | 'invalid_key' | 'api_not_enabled'; detail: string }> {
  if (!getGoogleMapsApiKey()) return { status: 'missing', detail: 'GOOGLE_PLACES_API_KEY not set' };
  const fetched = await fetchGooglePlaceReviews();
  if (!fetched.ok) {
    const m = fetched.error.toLowerCase();
    if (/billing|payment/i.test(m)) return { status: 'api_not_enabled', detail: fetched.error };
    if (/not enabled|permission|denied|invalid/i.test(m)) return { status: 'api_not_enabled', detail: fetched.error };
    return { status: 'invalid_key', detail: fetched.error };
  }
  return {
    status: 'connected',
    detail: `Place ${fetched.placeId}: ${fetched.reviews.length} review(s) available from Google`,
  };
}

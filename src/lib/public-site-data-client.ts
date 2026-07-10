import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { PublicSiteDataPayload } from '@/lib/public-site-data';

let inflight: Promise<PublicSiteDataPayload | null> | null = null;
let cached: { data: PublicSiteDataPayload; at: number } | null = null;
const CLIENT_TTL_MS = 45_000;

/** Deduped client fetch — one network request per page load across all hooks/components. */
export async function fetchPublicSiteDataClient(): Promise<PublicSiteDataPayload | null> {
  const now = Date.now();
  if (cached && now - cached.at < CLIENT_TTL_MS) {
    return cached.data;
  }

  if (!inflight) {
    inflight = fetchWithTimeout('/api/public/site-data', { cache: 'default', timeoutMs: 8000 })
      .then(async (r) => {
        try {
          return (await r.json()) as PublicSiteDataPayload;
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (data) cached = { data, at: Date.now() };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}

export function invalidatePublicSiteDataClientCache() {
  cached = null;
  inflight = null;
}

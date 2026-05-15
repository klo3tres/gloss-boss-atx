'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

type Row = { id: string; image_url: string | null; url: string | null; caption: string | null };

/** Local bundled placeholders (works offline); then remote samples if needed. */
const LOCAL_PLACEHOLDER_IMAGES: Row[] = [
  { id: 'local-ph-1', image_url: '/gallery-fallback/1.svg', url: null, caption: null },
  { id: 'local-ph-2', image_url: '/gallery-fallback/2.svg', url: null, caption: null },
  { id: 'local-ph-3', image_url: '/gallery-fallback/3.svg', url: null, caption: null },
];

/** Curated placeholders when CMS has no rows or fetch fails (never blank strip). */
const REMOTE_PLACEHOLDER_IMAGES: Row[] = [
  {
    id: 'ph-1',
    image_url: 'https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=900&q=80',
    url: null,
    caption: null,
  },
  {
    id: 'ph-2',
    image_url: 'https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&w=900&q=80',
    url: null,
    caption: null,
  },
  {
    id: 'ph-3',
    image_url: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=900&q=80',
    url: null,
    caption: null,
  },
];

const GALLERY_FALLBACK_ROWS = [...LOCAL_PLACEHOLDER_IMAGES, ...REMOTE_PLACEHOLDER_IMAGES];

function rowVisualUrl(r: Row): string {
  return String(r.url || r.image_url || '').trim();
}

/** Remote first (up to `max`), pad with fallbacks; dedupe by visual URL to avoid flicker / duplicates. */
function mergeGalleryRows(remote: Row[], max: number): Row[] {
  const out: Row[] = [];
  const seen = new Set<string>();
  for (const r of remote) {
    const u = rowVisualUrl(r);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(r);
    if (out.length >= max) return out;
  }
  for (const r of GALLERY_FALLBACK_ROWS) {
    const u = rowVisualUrl(r);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

export function HomeGalleryStrip() {
  const [rows, setRows] = useState<Row[]>(() => mergeGalleryRows([], 6));
  const [usedFallback, setUsedFallback] = useState(true);
  const settledRef = useRef(false);

  useEffect(() => {
    const watchdog = window.setTimeout(() => {
      if (settledRef.current) return;
      settledRef.current = true;
      setRows(mergeGalleryRows([], 6));
      setUsedFallback(true);
    }, 10000);
    return () => clearTimeout(watchdog);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchWithTimeout('/api/gallery/public', { cache: 'no-store', timeoutMs: 10000 })
      .then(async (r) => {
        if (!r.ok) {
          console.warn('[CRM_DEBUG_UI]', 'gallery_public_http', r.status);
          return null;
        }
        try {
          return (await r.json()) as { images?: Row[] };
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (cancelled) return;
        settledRef.current = true;
        const list = (data?.images ?? []).filter((i) => rowVisualUrl(i));
        const merged = mergeGalleryRows(list, 6);
        setRows(merged);
        setUsedFallback(list.length === 0);
      })
      .catch((e) => {
        if (cancelled) return;
        settledRef.current = true;
        console.warn('[CRM_DEBUG_UI]', 'gallery_public_fetch', e instanceof Error ? e.message : e);
        setRows(mergeGalleryRows([], 6));
        setUsedFallback(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className='mt-8 space-y-2'>
      {usedFallback ? (
        <p className='text-xs text-zinc-500'>Showing sample imagery until published photos are available in Admin → Website CMS.</p>
      ) : null}
      <div className='grid gap-4 md:grid-cols-3'>
        {rows.slice(0, 6).map((row) => {
          const imageUrl = (row.url || row.image_url) as string;
          return (
            <div key={row.id} className='transition hover:-translate-y-1'>
              <article className='group overflow-hidden rounded-2xl border border-gold/25 shadow-[0_0_24px_rgba(212,166,77,0.08)] transition hover:border-gold/50 hover:shadow-[0_0_36px_rgba(212,166,77,0.2)]'>
                <div
                  className='h-64 bg-cover bg-center transition duration-500 group-hover:scale-105'
                  style={{ backgroundImage: `url(${imageUrl})` }}
                />
              </article>
            </div>
          );
        })}
      </div>
    </div>
  );
}

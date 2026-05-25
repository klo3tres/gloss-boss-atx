import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeGalleryRowsPublic } from '@/lib/gallery-normalize';
import { tryCreateAdminSupabase, tryCreateRoutePublicSupabase } from '@/lib/supabase/safeClient';

async function fetchPublishedGalleryRows(client: SupabaseClient): Promise<unknown[]> {
  const attempts = [
    () =>
      client
        .from('gallery_images')
        .select('*')
        .eq('published', true)
        .order('order_index', { ascending: true, nullsFirst: false })
        .order('sort_order', { ascending: true }),
    () => client.from('gallery_images').select('*').eq('published', true).order('sort_order', { ascending: true }),
    () =>
      client
        .from('gallery_images')
        .select('*')
        .order('order_index', { ascending: true, nullsFirst: false })
        .order('sort_order', { ascending: true }),
    () => client.from('gallery_images').select('*').order('sort_order', { ascending: true }),
  ];

  let lastMsg = '';
  for (const run of attempts) {
    const { data, error } = await run();
    if (!error) {
      const raw = data ?? [];
      return raw.filter((row) => {
        if (!row || typeof row !== 'object') return false;
        const o = row as Record<string, unknown>;
        if (typeof o.published === 'boolean') return o.published;
        if (typeof o.active === 'boolean') return o.active;
        return true;
      });
    }
    lastMsg = error.message;
    if (!/published|active|order_index|column|Could not find|schema cache/i.test(error.message)) break;
  }
  if (lastMsg) console.warn('[CRM_DEBUG_DB]', 'gallery_public_query', lastMsg);
  return [];
}

/** Published gallery images for marketing pages (anon or service-role read). */
export async function GET() {
  try {
    const supabase = tryCreateRoutePublicSupabase() ?? tryCreateAdminSupabase();
    if (!supabase) {
      return NextResponse.json({ images: [] });
    }

    const rawRows = await fetchPublishedGalleryRows(supabase);
    const images = normalizeGalleryRowsPublic(rawRows).sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    return NextResponse.json(
      { images },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[CRM_DEBUG_DB]', 'gallery_public_unhandled', msg);
    return NextResponse.json({ images: [] }, { status: 200 });
  }
}

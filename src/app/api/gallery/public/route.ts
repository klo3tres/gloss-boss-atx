import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase, tryCreateRoutePublicSupabase } from '@/lib/supabase/safeClient';

/** Published gallery images for marketing pages (anon or service-role read). */
export async function GET() {
  try {
    const supabase = tryCreateRoutePublicSupabase() ?? tryCreateAdminSupabase();
    if (!supabase) {
      return NextResponse.json({ images: [] });
    }

    const { data, error } = await supabase
      .from('gallery_images')
      .select('id, image_url, url, caption, sort_order, order_index, featured')
      .eq('published', true)
      .order('order_index', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true });

    if (error) {
      console.warn('[CRM_DEBUG_DB]', 'gallery_public_query', error.message);
      return NextResponse.json({ images: [] }, { status: 200 });
    }

    return NextResponse.json(
      { images: Array.isArray(data) ? data : [] },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[CRM_DEBUG_DB]', 'gallery_public_unhandled', msg);
    return NextResponse.json({ images: [] }, { status: 200 });
  }
}

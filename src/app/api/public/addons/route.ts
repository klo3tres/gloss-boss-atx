import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase, tryCreateRoutePublicSupabase } from '@/lib/supabase/safeClient';
import { normalizeAddonForPublic } from '@/lib/addons-shared';

export const runtime = 'nodejs';

/** Public add-on labels for booking UI (active rows only). */
export async function GET() {
  try {
    const admin = tryCreateAdminSupabase();
    const anon = tryCreateRoutePublicSupabase();
    const client = admin ?? anon;
    if (!client) {
      return NextResponse.json({ addons: [] });
    }

    let { data, error } = await client
      .from('addons')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true });

    if (error && /schema cache|Could not find|column/i.test(error.message)) {
      ({ data, error } = await client
        .from('addons')
        .select('id, slug, name, price_cents, sort_order, active')
        .eq('active', true)
        .order('sort_order', { ascending: true }));
    }
    if (error && /schema cache|Could not find|column/i.test(error.message)) {
      ({ data, error } = await client
        .from('addons')
        .select('id, slug, price_cents, sort_order, active')
        .eq('active', true)
        .order('sort_order', { ascending: true }));
    }

    if (error) {
      console.warn('[CRM_DEBUG]', 'addons_public_get', error.message);
      return NextResponse.json({ addons: [] });
    }

    const raw = (data ?? []) as Record<string, unknown>[];
    const addons = raw.map((r) => normalizeAddonForPublic(r));

    return NextResponse.json(
      { addons },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[CRM_DEBUG]', 'addons_public_get_unhandled', msg);
    return NextResponse.json({ addons: [] });
  }
}

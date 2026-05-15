import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase, tryCreateRoutePublicSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

/** Public add-on labels for booking UI (active rows only). */
export async function GET() {
  const admin = tryCreateAdminSupabase();
  const anon = tryCreateRoutePublicSupabase();
  const client = admin ?? anon;
  if (!client) {
    return NextResponse.json({ addons: [] });
  }

  const { data, error } = await client
    .from('addons')
    .select('id, slug, label, price_cents, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.warn('[CRM_DEBUG]', 'addons_public_get', error.message);
    return NextResponse.json({ addons: [] });
  }

  return NextResponse.json(
    { addons: data ?? [] },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } },
  );
}

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getLocalFallbackCatalog,
  mergeFallbackPricesByServiceSlug,
  servicesHaveQuotesForBooking,
} from '@/lib/catalog-fallback';
import { isSupabasePublicReady, tryCreateAdminSupabase, tryCreateRoutePublicSupabase } from '@/lib/supabase/safeClient';

function jsonFallback(extra: Record<string, unknown>) {
  const fb = getLocalFallbackCatalog();
  return NextResponse.json({
    services: fb.services,
    prices: fb.prices,
    live: false,
    canBookOnline: false,
    catalogEmpty: false,
    fallbackCatalog: true,
    ...extra,
  });
}

/**
 * Public catalog: Supabase when healthy; merged or full static fallback so UI never dead-ends.
 */
export async function GET() {
  try {
    const emptyDbMessage =
      'No services in the database — showing sample packages. Add services and prices in Admin (or run migrations) to enable online booking.';

    if (!isSupabasePublicReady()) {
      console.warn('[CRM_DEBUG_DB]', 'services_route', 'SUPABASE_NOT_READY');
      return jsonFallback({
        code: 'SUPABASE_NOT_READY',
        message: 'Supabase is not configured — showing sample packages for reference only.',
      });
    }

    const admin = tryCreateAdminSupabase();
    const anon = tryCreateRoutePublicSupabase();
    const supabase = admin ?? anon;

    if (!supabase) {
      console.warn('[CRM_DEBUG_DB]', 'services_route', 'NO_CLIENT');
      return jsonFallback({
        code: 'SUPABASE_NOT_READY',
        message: 'Could not initialize Supabase — showing sample packages for reference only.',
      });
    }

    async function loadCatalog(client: SupabaseClient) {
      const { data: services, error: sErr } = await client
        .from('services')
        .select('id, slug, title, subtitle, sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true });

      const { data: prices, error: pErr } = await client.from('service_prices').select('service_id, vehicle_class, price_cents');

      return { services: services ?? [], prices: prices ?? [], sErr, pErr };
    }

    const first = await loadCatalog(supabase);

    if (first.sErr) {
      const msg = first.sErr.message ?? '';
      if (/relation|does not exist|schema cache/i.test(msg)) {
        console.warn('[CRM_DEBUG_DB]', 'schema_missing_services', msg);
      } else {
        console.warn('[CRM_DEBUG_DB]', 'services_query', msg);
      }
      return jsonFallback({
        code: 'SUPABASE_QUERY_ERROR',
        message: 'Could not load services from the database — showing sample packages. Online booking is disabled until the catalog loads.',
        detail: msg,
      });
    }

    let services = first.services;
    let prices = first.prices;
    const pErr = first.pErr;

    if (pErr) {
      const msg = pErr.message ?? '';
      if (/relation|does not exist|schema cache/i.test(msg)) {
        console.warn('[CRM_DEBUG_DB]', 'schema_missing_service_prices', msg);
      } else {
        console.warn('[CRM_DEBUG_DB]', 'service_prices_query', msg);
      }
    }

    if (services.length === 0) {
      console.warn('[CRM_DEBUG_DB]', 'catalog_empty_services');
      return jsonFallback({
        code: 'CATALOG_EMPTY',
        message: emptyDbMessage,
      });
    }

    if (pErr || prices.length === 0) {
      const merged = mergeFallbackPricesByServiceSlug(services);
      prices = merged.length > 0 ? merged : prices;
      const canBook = servicesHaveQuotesForBooking(services, prices);
      return NextResponse.json({
        services,
        prices,
        live: canBook,
        canBookOnline: canBook,
        catalogEmpty: false,
        fallbackCatalog: false,
        code: pErr ? 'SUPABASE_QUERY_ERROR' : 'PRICES_FILLED_FROM_DEFAULTS',
        message: canBook
          ? pErr
            ? 'Live services with reference pricing from defaults until service_prices is available.'
            : undefined
          : 'Some packages are missing prices in the database — online booking is disabled until pricing is configured.',
        detail: pErr ? pErr.message : undefined,
      });
    }

    return NextResponse.json({
      services,
      prices,
      live: true,
      canBookOnline: true,
      catalogEmpty: false,
      fallbackCatalog: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[CRM_DEBUG_DB]', 'services_route_unhandled', msg);
    return jsonFallback({
      code: 'UNHANDLED',
      message: 'Catalog service error — showing sample packages. Online booking is disabled.',
      detail: msg,
    });
  }
}

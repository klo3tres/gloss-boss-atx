import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getLocalFallbackCatalog,
  loadActiveServicesResilient,
  mapServicePriceRows,
  mergeServicesWithPricesStable,
  servicesHaveQuotesForBooking,
} from '@/lib/catalog-fallback';
import { isSupabasePublicReady, tryCreateAdminSupabase, tryCreateRoutePublicSupabase } from '@/lib/supabase/safeClient';
import { consolidatePriceRowsForUi } from '@/lib/vehicle-pricing';

function jsonFallback(extra: Record<string, unknown>) {
  const fb = getLocalFallbackCatalog();
  const prices = consolidatePriceRowsForUi(fb.prices);
  const canBook = servicesHaveQuotesForBooking(fb.services, prices);
  return NextResponse.json({
    services: fb.services,
    prices,
    live: false,
    canBookOnline: canBook,
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
      const { rows: services, error: sErrMsg } = await loadActiveServicesResilient(client);
      const sErr = sErrMsg ? { message: sErrMsg } : null;

      const { data: pricesRaw, error: pErr } = await client.from('service_prices').select('*');
      const prices = mapServicePriceRows((pricesRaw ?? []) as unknown[]);

      return { services, prices, sErr, pErr };
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
        message: 'Could not load services from the database — showing default packages with reference pricing.',
        detail: msg,
      });
    }

    let services = first.services;
    let prices = first.prices;
    const pErr = first.pErr;

    if (services.length > 0) {
      const stable = mergeServicesWithPricesStable(services, prices);
      services = stable.services;
      prices = consolidatePriceRowsForUi(stable.prices);
    }

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

    const canBook = servicesHaveQuotesForBooking(services, prices) || (services.length > 0 && prices.length > 0);

    if (pErr || first.prices.length === 0) {
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
            ? 'Live services with default pricing until service_prices is available.'
            : undefined
          : 'Some rows may need prices in Admin — booking stays available when quotes compute.',
        detail: pErr ? pErr.message : undefined,
      });
    }

    return NextResponse.json({
      services,
      prices,
      live: true,
      canBookOnline: servicesHaveQuotesForBooking(services, prices) || (services.length > 0 && prices.length > 0),
      catalogEmpty: false,
      fallbackCatalog: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[CRM_DEBUG_DB]', 'services_route_unhandled', msg);
    return jsonFallback({
      code: 'UNHANDLED',
      message: 'Catalog service error — showing default packages.',
      detail: msg,
    });
  }
}

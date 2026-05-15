import { NextResponse } from 'next/server';
import {
  computeMultiCarExample,
  defaultFeaturedShowcaseSlides,
  defaultMarketingOffers,
  getOfflineMarketingPackages,
  mapCatalogToServicePackages,
  parseDealConfig,
  parseFeaturedShowcase,
  type PublicSiteDataPayload,
  type SiteDataOfferCard,
} from '@/lib/public-site-data';
import { loadActiveServicesResilient, mapServicePriceRows, mergeServicesWithPricesStable } from '@/lib/catalog-fallback';
import { tryCreateAdminSupabase, tryCreateRoutePublicSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

function offlinePayload(extraWarnings: string[]): PublicSiteDataPayload {
  return {
    ok: false,
    schemaWarnings: extraWarnings,
    services: getOfflineMarketingPackages(),
    deals: parseDealConfig(null),
    offers: defaultMarketingOffers(),
    multiCar: computeMultiCarExample(getOfflineMarketingPackages(), parseDealConfig(null)),
    featuredShowcase: defaultFeaturedShowcaseSlides(),
  };
}

export async function GET() {
  try {
    const schemaWarnings: string[] = [];
    const admin = tryCreateAdminSupabase();
    const anon = tryCreateRoutePublicSupabase();
    const client = admin ?? anon;

    if (!client) {
      const payload: PublicSiteDataPayload = {
        ok: false,
        schemaWarnings: ['Supabase is not configured (missing URL/keys).'],
        services: getOfflineMarketingPackages(),
        deals: parseDealConfig(null),
        offers: defaultMarketingOffers(),
        multiCar: computeMultiCarExample(getOfflineMarketingPackages(), parseDealConfig(null)),
        featuredShowcase: defaultFeaturedShowcaseSlides(),
      };
      return NextResponse.json(payload);
    }

    const [pricesRes, dealRes, offersFull, featuredRes, svcLoad] = await Promise.all([
      client.from('service_prices').select('*'),
      client.from('homepage_content').select('value').eq('key', 'deal_config').maybeSingle(),
      client
        .from('offers')
        .select('*')
        .order('sort_order', { ascending: true }),
      client.from('homepage_content').select('value').eq('key', 'featured_showcase').maybeSingle(),
      loadActiveServicesResilient(client),
    ]);

    const sErr = svcLoad.error ? { message: svcLoad.error } : null;
    const pErr = pricesRes.error;
    const dErr = dealRes.error;
    const fErr = featuredRes.error;
    const services = svcLoad.rows;
    const prices = pricesRes.data;
    const dealRow = dealRes.data;

    if (sErr) {
      console.warn('[CRM_DEBUG_DB]', 'site_data_services', sErr.message);
      schemaWarnings.push('Using default catalog temporarily.');
    }
    if (pErr) {
      console.warn('[CRM_DEBUG_DB]', 'site_data_service_prices', pErr.message);
      schemaWarnings.push('Using default pricing temporarily.');
    }
    if (dErr) schemaWarnings.push(`homepage_content(deal_config): ${dErr.message}`);
    if (fErr) schemaWarnings.push(`homepage_content(featured_showcase): ${fErr.message}`);

    let offerRows: Record<string, unknown>[] = [];
    if (offersFull.error) {
      const offersCompat = await client.from('offers').select('*').order('sort_order', { ascending: true });
      if (offersCompat.error) {
        schemaWarnings.push(`offers: ${offersFull.error.message}`);
      } else {
        offerRows = (offersCompat.data ?? []) as Record<string, unknown>[];
      }
    } else {
      offerRows = (offersFull.data ?? []) as Record<string, unknown>[];
    }

    const svcList = services ?? [];
    const rawPriceRows = mapServicePriceRows((prices ?? []) as unknown[]);
    const stable = svcList.length > 0 && !sErr ? mergeServicesWithPricesStable(svcList, rawPriceRows) : { services: [] as typeof svcList, prices: [] as typeof rawPriceRows };
    let packages =
      stable.services.length > 0 && !sErr ? mapCatalogToServicePackages(stable.services, stable.prices) : [];

    if (packages.length === 0) {
      console.warn('[CRM_DEBUG_DB]', 'site_data_catalog_fallback', {
        sErr: sErr?.message,
        svcCount: svcList.length,
      });
      packages = getOfflineMarketingPackages();
      if (!schemaWarnings.some((w) => w.includes('embedded default'))) {
        schemaWarnings.push('Catalog: using embedded default packages (database empty or unavailable).');
      }
    }

    const deals = parseDealConfig(dealRow?.value ?? null);

    let offers: SiteDataOfferCard[] = offerRows.map((r: Record<string, unknown>) => {
      const title = (typeof r.title === 'string' && r.title.trim()) || (typeof r.label === 'string' && r.label.trim()) || 'Offer';
      const desc = typeof r.description === 'string' ? r.description : '';
      const pct =
        typeof r.discount_percent === 'number' && !Number.isNaN(r.discount_percent)
          ? r.discount_percent
          : Number(r.percent_off ?? 0);
      return {
        id: String(r.id),
        title,
        description: desc,
        discountPercent: pct,
        active: Boolean(r.active),
        sortOrder: Number(r.sort_order ?? 0),
      };
    });
    if (offers.length === 0) offers = defaultMarketingOffers();

    const multiCar = packages.length ? computeMultiCarExample(packages, deals) : null;

    const featuredShowcase = fErr ? defaultFeaturedShowcaseSlides() : parseFeaturedShowcase(featuredRes.data?.value ?? null);

    const payload: PublicSiteDataPayload = {
      ok: schemaWarnings.length === 0 && svcList.length > 0 && !sErr,
      schemaWarnings,
      services: packages,
      deals,
      offers,
      multiCar,
      featuredShowcase,
    };

    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[CRM_DEBUG_DB]', 'site_data_route_unhandled', msg);
    return NextResponse.json(offlinePayload([`site-data: ${msg}`]));
  }
}

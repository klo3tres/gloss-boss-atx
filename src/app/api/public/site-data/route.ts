import { NextResponse } from 'next/server';
import {
  computeMultiCarExample,
  dedupePublicOffers,
  defaultFeaturedShowcaseSlides,
  getOfflineMarketingPackages,
  isOfferEligiblePublicSiteData,
  mapCatalogToServicePackages,
  mapDbRowToSiteDataOfferCard,
  parseDealConfig,
  parseFeaturedShowcase,
  type PublicSiteDataPayload,
  type SiteDataOfferCard,
} from '@/lib/public-site-data';
import { loadActiveServicesResilient, mapServicePriceRows, mergeServicesWithPricesStable } from '@/lib/catalog-fallback';
import { parseFleetPricing } from '@/lib/fleet-pricing';
import { consolidatePriceRowsForUi } from '@/lib/vehicle-pricing';
import { tryCreateAdminSupabase, tryCreateRoutePublicSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

function offlinePayload(extraWarnings: string[]): PublicSiteDataPayload {
  return {
    ok: false,
    schemaWarnings: extraWarnings,
    services: getOfflineMarketingPackages(),
    deals: parseDealConfig(null),
    offers: [],
    multiCar: computeMultiCarExample(getOfflineMarketingPackages(), parseDealConfig(null)),
    featuredShowcase: defaultFeaturedShowcaseSlides(),
    featuredShowcaseFromCms: false,
    googleReviewUrl: '',
    homepageVisuals: null,
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
        offers: [],
        multiCar: computeMultiCarExample(getOfflineMarketingPackages(), parseDealConfig(null)),
        featuredShowcase: defaultFeaturedShowcaseSlides(),
        featuredShowcaseFromCms: false,
        googleReviewUrl: '',
      };
      return NextResponse.json(payload);
    }

    const [pricesRes, dealRes, offersFull, featuredRes, svcLoad, reviewRes, ssGoogle, fleetRes, visualsRes] = await Promise.all([
      client.from('service_prices').select('*'),
      client.from('homepage_content').select('value').eq('key', 'deal_config').maybeSingle(),
      client
        .from('offers')
        .select('*')
        .order('sort_order', { ascending: true }),
      client.from('homepage_content').select('value').eq('key', 'featured_showcase').maybeSingle(),
      loadActiveServicesResilient(client),
      client.from('review_settings').select('value').eq('key', 'google_business').maybeSingle(),
      client.from('site_settings').select('value').eq('key', 'google_review_url').maybeSingle(),
      client.from('site_settings').select('key, value').in('key', ['fleet_services_enabled', 'fleet_services_blurb', 'fleet_pricing']),
      client.from('site_settings').select('value').eq('key', 'homepage_visuals').maybeSingle(),
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
    if (reviewRes.error) schemaWarnings.push(`review_settings: ${reviewRes.error.message}`);
    if (ssGoogle.error) schemaWarnings.push(`site_settings(google_review_url): ${ssGoogle.error.message}`);

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
    const uiPrices = consolidatePriceRowsForUi(stable.prices);
    let packages = stable.services.length > 0 && !sErr ? mapCatalogToServicePackages(stable.services, uiPrices) : [];

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

    const now = new Date();
    const mapped = offerRows
      .map((r) => mapDbRowToSiteDataOfferCard(r))
      .filter((o): o is SiteDataOfferCard => Boolean(o));
    const offers: SiteDataOfferCard[] = dedupePublicOffers(
      mapped
        .filter((o) => isOfferEligiblePublicSiteData(o, now))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)),
    );

    const multiCar = packages.length ? computeMultiCarExample(packages, deals) : null;

    const cmsFeatured = fErr ? [] : parseFeaturedShowcase(featuredRes.data?.value ?? null, { publicSite: true });
    const featuredShowcaseFromCms = cmsFeatured.length > 0;
    const featuredShowcase = featuredShowcaseFromCms ? cmsFeatured : defaultFeaturedShowcaseSlides();

    let googleReviewUrl = '';
    const rawRv = reviewRes.data?.value;
    if (rawRv && typeof rawRv === 'object' && rawRv !== null && 'review_url' in rawRv) {
      const u = (rawRv as { review_url?: unknown }).review_url;
      if (typeof u === 'string') googleReviewUrl = u.trim();
    }
    if (!googleReviewUrl && ssGoogle.data?.value != null) {
      const rawG = String(ssGoogle.data.value).trim();
      if (rawG.startsWith('http')) {
        googleReviewUrl = rawG;
      } else {
        try {
          const o = JSON.parse(rawG) as { url?: string };
          if (typeof o?.url === 'string' && o.url.trim()) googleReviewUrl = o.url.trim();
        } catch {
          /* ignore */
        }
      }
    }

    const fleetRows = (fleetRes.data ?? []) as Array<{ key?: string; value?: unknown }>;
    const fleetServicesEnabled = fleetRows.some(
      (r) => r.key === 'fleet_services_enabled' && String(r.value ?? '').toLowerCase() === 'true',
    );
    const fleetServicesBlurb = String(
      fleetRows.find((r) => r.key === 'fleet_services_blurb')?.value ??
        'Fleet, dealership, and business accounts — call for volume pricing and on-site schedules.',
    );
    const fleetPricingRaw = fleetRows.find((r) => r.key === 'fleet_pricing')?.value;
    let fleetPricing = parseFleetPricing(null);
    if (fleetPricingRaw) {
      try {
        fleetPricing = parseFleetPricing(
          typeof fleetPricingRaw === 'string' ? JSON.parse(fleetPricingRaw) : fleetPricingRaw,
        );
      } catch {
        /* default */
      }
    }

    const payload: PublicSiteDataPayload = {
      ok: schemaWarnings.length === 0 && svcList.length > 0 && !sErr,
      schemaWarnings,
      services: packages,
      deals,
      offers,
      multiCar,
      featuredShowcase,
      featuredShowcaseFromCms,
      googleReviewUrl,
      homepageVisuals: visualsRes.data?.value ? (typeof visualsRes.data.value === 'string' ? JSON.parse(visualsRes.data.value) : visualsRes.data.value) : null,
      fleetServicesEnabled,
      fleetServicesBlurb,
      fleetPricing,
    };

    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[CRM_DEBUG_DB]', 'site_data_route_unhandled', msg);
    return NextResponse.json(offlinePayload([`site-data: ${msg}`]));
  }
}

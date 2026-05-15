import { NextResponse } from 'next/server';
import {
  computeMultiCarExample,
  getOfflineMarketingPackages,
  mapCatalogToServicePackages,
  parseDealConfig,
  type PublicSiteDataPayload,
  type SiteDataOfferCard,
} from '@/lib/public-site-data';
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
      };
      return NextResponse.json(payload);
    }

    const [servicesRes, pricesRes, dealRes, offersFull] = await Promise.all([
      client.from('services').select('id, slug, title, subtitle, sort_order').eq('active', true).order('sort_order', { ascending: true }),
      client.from('service_prices').select('service_id, vehicle_class, price_cents'),
      client.from('homepage_content').select('value').eq('key', 'deal_config').maybeSingle(),
      client
        .from('offers')
        .select('id, title, description, discount_percent, label, percent_off, active, sort_order')
        .order('sort_order', { ascending: true }),
    ]);

    const sErr = servicesRes.error;
    const pErr = pricesRes.error;
    const dErr = dealRes.error;
    const services = servicesRes.data;
    const prices = pricesRes.data;
    const dealRow = dealRes.data;

    if (sErr) schemaWarnings.push(`services: ${sErr.message}`);
    if (pErr) schemaWarnings.push(`service_prices: ${pErr.message}`);
    if (dErr) schemaWarnings.push(`homepage_content(deal_config): ${dErr.message}`);

    let offerRows: Record<string, unknown>[] = [];
    if (offersFull.error) {
      const offersCompat = await client
        .from('offers')
        .select('id, label, percent_off, active, sort_order')
        .order('sort_order', { ascending: true });
      if (offersCompat.error) {
        schemaWarnings.push(`offers: ${offersFull.error.message}`);
      } else {
        offerRows = (offersCompat.data ?? []) as Record<string, unknown>[];
      }
    } else {
      offerRows = (offersFull.data ?? []) as Record<string, unknown>[];
    }

    const svcList = services ?? [];
    const priceList = prices ?? [];
    let packages = svcList.length > 0 && !sErr ? mapCatalogToServicePackages(svcList, priceList) : [];

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

    const offers: SiteDataOfferCard[] = offerRows.map((r: Record<string, unknown>) => {
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

    const multiCar = packages.length ? computeMultiCarExample(packages, deals) : null;

    const payload: PublicSiteDataPayload = {
      ok: schemaWarnings.length === 0 && svcList.length > 0 && !sErr,
      schemaWarnings,
      services: packages,
      deals,
      offers,
      multiCar,
    };

    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[CRM_DEBUG_DB]', 'site_data_route_unhandled', msg);
    return NextResponse.json(offlinePayload([`site-data: ${msg}`]));
  }
}

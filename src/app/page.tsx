import { HomePageClient } from '@/components/marketing/home/home-page-client';
import { defaultDealConfig, defaultServicePackages } from '@/lib/site-config';
import type { PublicSiteDataPayload } from '@/lib/public-site-data';
import { headers } from 'next/headers';

export const revalidate = 60;

async function loadPublicSiteData(): Promise<PublicSiteDataPayload | null> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
    const proto = h.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
    const res = await fetch(`${proto}://${host}/api/public/site-data`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as PublicSiteDataPayload;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const data = await loadPublicSiteData();
  const emptyDeals = {
    websitePromoPercent: 0,
    websitePromoLabel: '',
    websitePromoActive: false,
    multiCarSecondVehicleDiscountPercent: 0,
    promoStacksWithMultiCar: true,
  };

  const initial = data
    ? {
        loaded: true as const,
        services: data.services ?? [],
        deals: data.deals ?? emptyDeals,
        offers: data.offers ?? [],
        multiCar: data.multiCar ?? null,
        schemaWarnings: data.schemaWarnings ?? [],
        googleReviewUrl: data.googleReviewUrl ?? '',
        socialLinks: data.socialLinks ?? { instagramUrl: '', tiktokUrl: '', youtubeUrl: '', facebookUrl: '' },
        visuals: (data.homepageVisuals as Record<string, unknown>) ?? null,
        reviews: data.reviews ?? [],
        mediaRegistry: data.mediaRegistry ?? {},
        brand: data.brand ?? null,
        fleetEnabled: Boolean(data.fleetServicesEnabled),
        fleetBlurb: String(data.fleetServicesBlurb ?? ''),
        fleetPricing: data.fleetPricing ?? null,
        packages: data.services?.length ? data.services : defaultServicePackages,
      }
    : undefined;

  return <HomePageClient initial={initial} />;
}

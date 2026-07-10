'use client';

import { useEffect, useState } from 'react';
import { fetchPublicSiteDataClient } from '@/lib/public-site-data-client';
import type { PublicBrandPayload } from '@/lib/brand/public-brand-types';
import {
  defaultDealConfig,
  defaultServicePackages,
  type DealConfig,
  type ServicePackage,
} from '@/lib/site-config';
import type {
  PublicReview,
  PublicSiteDataPayload,
  SiteDataMultiCar,
  SiteDataOfferCard,
} from '@/lib/public-site-data';
import type { MediaRegistry } from '@/lib/media-registry';

const emptyDeals: DealConfig = {
  websitePromoPercent: 0,
  websitePromoLabel: '',
  websitePromoActive: false,
  multiCarSecondVehicleDiscountPercent: 0,
  promoStacksWithMultiCar: true,
};

export type PublicSiteDataState = {
  loaded: boolean;
  services: ServicePackage[];
  deals: DealConfig;
  offers: SiteDataOfferCard[];
  multiCar: SiteDataMultiCar | null;
  schemaWarnings: string[];
  googleReviewUrl: string;
  socialLinks: { instagramUrl: string; tiktokUrl: string; youtubeUrl: string; facebookUrl: string };
  visuals: Record<string, unknown> | null;
  reviews: PublicReview[];
  mediaRegistry: MediaRegistry;
  brand: PublicBrandPayload | null;
  fleetEnabled: boolean;
  fleetBlurb: string;
  fleetPricing: PublicSiteDataPayload['fleetPricing'] | null;
};

const initialState: PublicSiteDataState = {
  loaded: false,
  services: [],
  deals: emptyDeals,
  offers: [],
  multiCar: null,
  schemaWarnings: [],
  googleReviewUrl: '',
  socialLinks: { instagramUrl: '', tiktokUrl: '', youtubeUrl: '', facebookUrl: '' },
  visuals: null,
  reviews: [],
  mediaRegistry: {},
  brand: null,
  fleetEnabled: false,
  fleetBlurb: '',
  fleetPricing: null,
};

export function usePublicSiteData(initial?: Partial<PublicSiteDataState>) {
  const hasInitial = Boolean(initial?.loaded);
  const [state, setState] = useState<PublicSiteDataState>(() =>
    hasInitial
      ? {
          ...initialState,
          ...initial,
          loaded: true,
        }
      : initialState,
  );

  useEffect(() => {
    if (hasInitial) return;
    let cancelled = false;
    const tid = window.setTimeout(() => {
      if (!cancelled) {
        setState((s) => ({
          ...s,
          loaded: true,
          schemaWarnings: s.schemaWarnings.length ? s.schemaWarnings : ['Public site data request timed out — showing defaults.'],
        }));
      }
    }, 10000);

    fetchPublicSiteDataClient()
      .then((data) => {
        if (!data || cancelled) return;
        setState({
          loaded: true,
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
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loaded: true,
            schemaWarnings: ['Could not load public site data.'],
          }));
        }
      })
      .finally(() => clearTimeout(tid));

    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [hasInitial]);

  const packages = state.loaded && state.services.length > 0 ? state.services : defaultServicePackages;
  const deals = state.loaded ? state.deals : defaultDealConfig;

  return { ...state, packages, deals };
}

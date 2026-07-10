'use client';

import { HomePageView } from '@/components/marketing/home/home-page-view';
import { usePublicSiteData } from '@/hooks/use-public-site-data';
import type { PublicSiteDataState } from '@/hooks/use-public-site-data';
import type { DealConfig, ServicePackage } from '@/lib/site-config';

export function HomePageClient({
  initial,
}: {
  initial?: Partial<PublicSiteDataState> & { packages?: ServicePackage[]; deals?: DealConfig };
}) {
  const site = usePublicSiteData(initial);
  return <HomePageView state={site} packages={site.packages} deals={site.deals} />;
}

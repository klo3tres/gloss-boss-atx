'use client';

import { HomePageView } from '@/components/marketing/home/home-page-view';
import { usePublicSiteData } from '@/hooks/use-public-site-data';

export default function HomePage() {
  const site = usePublicSiteData();
  return <HomePageView state={site} packages={site.packages} deals={site.deals} />;
}

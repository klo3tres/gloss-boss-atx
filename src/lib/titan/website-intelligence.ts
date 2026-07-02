import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getConfiguredGooglePlaceId } from '@/lib/google/google-place-reviews';
import { getGoogleMapsApiKey } from '@/lib/google/places-client';
import {
  fetchGoogleAnalyticsTraffic,
  googleAnalyticsDataApiConfigured,
} from '@/lib/google/google-analytics-data';
import { loadTitanWorkspace } from '@/lib/titan/workspace';
import {
  maskIntegrationId,
  type GaTrafficMetrics,
  type IntegrationCard,
  type TitanWebsiteRecommendation,
  type ReviewIntelRow,
  type WebsiteIntelligenceBundle,
} from '@/lib/titan/website-intelligence-types';

export type {
  IntegrationCardStatus,
  IntegrationCard,
  TitanWebsiteRecommendation,
  ReviewIntelRow,
  WebsiteIntelligenceBundle,
  WebsiteIntelligenceSummary,
  GaTrafficMetrics,
} from '@/lib/titan/website-intelligence-types';

export { maskIntegrationId, integrationStatusLabel, summarizeWebsiteIntelligence } from '@/lib/titan/website-intelligence-types';

const DEFAULT_GA_ID = 'G-VWFWQ0P9GB';
const DEFAULT_CLARITY_ID = 'xddon9jp0d';

function fileExists(relPath: string): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), relPath));
  } catch {
    return false;
  }
}

function parseSiteSettingValue(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'string' ? parsed : String(parsed ?? '');
    } catch {
      return raw.trim();
    }
  }
  return String(raw).trim();
}

function buildRecommendations(input: {
  gaDataApiConnected: boolean;
  gaTagInstalled: boolean;
  clarityScriptInstalled: boolean;
  gscVerified: boolean;
  sitemapPresent: boolean;
  publishedReviewCount: number;
  heroVideoEnabled: boolean;
  gaMetrics: { metrics7: GaTrafficMetrics; metrics28: GaTrafficMetrics } | null;
  recentBookings7d: number;
}): TitanWebsiteRecommendation[] {
  const recs: TitanWebsiteRecommendation[] = [];

  if (input.gaTagInstalled && !input.gaDataApiConnected) {
    recs.push({
      id: 'ga_api',
      tone: 'action',
      title: 'GA tag is installed, but Data API is not connected.',
      detail: 'Add GOOGLE_ANALYTICS_PROPERTY_ID plus service account credentials in Vercel to see traffic inside Titan.',
      href: '/admin/titan/website-intelligence#ga-traffic',
    });
  }

  if (input.clarityScriptInstalled) {
    recs.push({
      id: 'clarity_wait',
      tone: 'info',
      title: 'Clarity is installed. Check dashboard after visitors arrive.',
      detail: 'Recordings and heatmaps populate once real traffic hits the site.',
      href: 'https://clarity.microsoft.com/',
    });
  }

  if (input.gscVerified) {
    recs.push({
      id: 'gsc_sitemap',
      tone: input.sitemapPresent ? 'success' : 'action',
      title: input.sitemapPresent ? 'Search Console verified. Sitemap file detected.' : 'Search Console verified. Next: submit sitemap.',
      detail: input.sitemapPresent
        ? 'Submit your sitemap URL in Google Search Console for faster indexing.'
        : 'Add public/sitemap.xml or app/sitemap.ts, then submit in Search Console.',
      href: '/admin/titan/website-intelligence#search-console',
    });
  } else {
    recs.push({
      id: 'gsc_verify',
      tone: 'warning',
      title: 'Search Console not marked verified yet.',
      detail: 'Confirm DNS TXT verification, then toggle verified status here.',
      href: '/admin/titan/website-intelligence#search-console',
    });
  }

  if (input.publishedReviewCount === 0) {
    recs.push({
      id: 'reviews_empty',
      tone: 'action',
      title: 'No published reviews visible.',
      detail: 'Import Google reviews or add manual testimonials, then publish at least three.',
      href: '/admin/titan/website-intelligence#google-reviews',
    });
  }

  if (!input.heroVideoEnabled) {
    recs.push({
      id: 'hero_video',
      tone: 'info',
      title: 'Homepage has no hero video active.',
      detail: 'Enable hero video in Brand Settings or Media Studio for a premium first impression.',
      href: '/admin/brand-settings',
    });
  }

  const bookingViews =
    input.gaMetrics?.metrics7.topPages.find((p) => /\/book/i.test(p.path))?.views ?? 0;
  if (bookingViews > 0 && input.recentBookings7d === 0) {
    recs.push({
      id: 'booking_gap',
      tone: 'warning',
      title: 'Booking page traffic exists but no bookings yet.',
      detail: 'Review booking friction, deposit messaging, and follow-up on abandoned checkouts.',
      href: '/book',
    });
  }

  if (recs.length === 0) {
    recs.push({
      id: 'all_good',
      tone: 'success',
      title: 'Core website intelligence looks healthy.',
      detail: 'Keep monitoring GA Realtime, Clarity sessions, and published reviews weekly.',
    });
  }

  return recs;
}

export async function loadWebsiteIntelligenceBundle(admin: SupabaseClient): Promise<WebsiteIntelligenceBundle> {
  const checkedAt = new Date().toISOString();
  const ws = await loadTitanWorkspace(admin);

  const gaMeasurementId = ws.gaMeasurementId?.trim() || DEFAULT_GA_ID;
  const clarityProjectId =
    process.env.CLARITY_PROJECT_ID?.trim() || ws.clarityProjectId?.trim() || DEFAULT_CLARITY_ID;
  const gaTagInstalled = Boolean(gaMeasurementId);
  const clarityScriptInstalled = Boolean(clarityProjectId);
  const gaDataApiConnected = googleAnalyticsDataApiConfigured();

  const [
    reviewUrlRes,
    lastSyncRes,
    reviewsRes,
    publishedCountRes,
    bookingsRes,
    gaFetch,
  ] = await Promise.all([
    admin.from('site_settings').select('value').eq('key', 'google_review_url').maybeSingle(),
    admin.from('site_settings').select('value').eq('key', 'google_reviews_last_sync_at').maybeSingle(),
    admin
      .from('customer_reviews')
      .select('id, customer_name, rating, testimonial, review_text, source, published, featured, show_on_homepage, created_at, google_review_id')
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('customer_reviews').select('id', { count: 'exact', head: true }).eq('published', true),
    admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    gaDataApiConnected ? fetchGoogleAnalyticsTraffic() : Promise.resolve(null),
  ]);

  const googleReviewUrl = parseSiteSettingValue(reviewUrlRes.data?.value);
  const googleReviewsLastSyncAt = parseSiteSettingValue(lastSyncRes.data?.value) || null;
  const reviews = (reviewsRes.data ?? []) as ReviewIntelRow[];
  const publishedReviewCount = publishedCountRes.count ?? reviews.filter((r) => r.published).length;
  const homepageVisibleReviewCount = reviews.filter((r) => r.published && r.show_on_homepage !== false).length;
  const googleReviewsStoredCount = reviews.filter((r) => /google/i.test(String(r.source ?? '')) || Boolean(r.google_review_id)).length;
  const publishedRatings = reviews.filter((r) => r.published).map((r) => Number(r.rating) || 5);
  const averageRating =
    publishedRatings.length > 0
      ? Math.round((publishedRatings.reduce((a, b) => a + b, 0) / publishedRatings.length) * 10) / 10
      : null;

  const sitemapPresent = fileExists('public/sitemap.xml') || fileExists('src/app/sitemap.ts');
  const robotsPresent = fileExists('public/robots.txt') || fileExists('src/app/robots.ts');

  const googlePlacesKey = Boolean(getGoogleMapsApiKey());
  const googlePlaceId = Boolean(getConfiguredGooglePlaceId());
  const clarityApiConfigured = Boolean(process.env.CLARITY_API_TOKEN?.trim());
  const searchConsoleApiConfigured = Boolean(process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim());

  const gscVerified = ws.gscVerified === true;
  const gscPropertyUrl = ws.gscPropertyUrl?.trim() || ws.websiteUrl?.trim() || 'https://www.glossbossatx.com/';

  let gaMetrics: WebsiteIntelligenceBundle['gaMetrics'] = null;
  let gaDataApiError: string | null = null;
  if (gaFetch) {
    if (gaFetch.ok) gaMetrics = { metrics7: gaFetch.metrics7, metrics28: gaFetch.metrics28 };
    else gaDataApiError = gaFetch.error;
  }

  const integrations: IntegrationCard[] = [
    {
      id: 'google_analytics',
      label: 'Google Analytics',
      status: gaDataApiConnected ? 'connected' : gaTagInstalled ? 'configured' : 'missing',
      maskedId: maskIntegrationId(gaMeasurementId),
      description: 'Measures site traffic, pages, and conversion events.',
      setupInstructions: gaDataApiConnected
        ? ['Tag fires on every page.', 'Data API connected — metrics refresh on each visit to this page.']
        : [
            'Tag is live via root layout SiteAnalytics component.',
            'Open GA Realtime while browsing glossbossatx.com to confirm hits.',
            'Optional: set GOOGLE_ANALYTICS_PROPERTY_ID, GOOGLE_ANALYTICS_CLIENT_EMAIL, GOOGLE_ANALYTICS_PRIVATE_KEY for in-app metrics.',
          ],
      testHref: `https://analytics.google.com/analytics/web/#/p/realtime`,
      testLabel: 'Open GA Realtime',
      lastCheckedAt: checkedAt,
    },
    {
      id: 'microsoft_clarity',
      label: 'Microsoft Clarity',
      status: clarityScriptInstalled ? (clarityApiConfigured ? 'connected' : 'configured') : 'missing',
      maskedId: maskIntegrationId(clarityProjectId),
      description: 'Session recordings, heatmaps, and rage-click insights.',
      setupInstructions: [
        'Clarity script loads on every public page.',
        'Recordings appear after visitors browse the site.',
        'Optional: CLARITY_PROJECT_ID and CLARITY_API_TOKEN for future API exports.',
      ],
      testHref: 'https://clarity.microsoft.com/',
      testLabel: 'Open Clarity dashboard',
      lastCheckedAt: checkedAt,
    },
    {
      id: 'search_console',
      label: 'Google Search Console',
      status: gscVerified
        ? searchConsoleApiConfigured
          ? 'connected'
          : 'configured'
        : 'needs_verification',
      maskedId: gscPropertyUrl,
      description: 'Search performance, indexing, and SEO coverage.',
      setupInstructions: [
        'Verification method: DNS TXT record on your domain.',
        'Mark verified here after Google confirms ownership.',
        'Optional: GOOGLE_SEARCH_CONSOLE_SITE_URL for clicks/impressions API later.',
      ],
      testHref: 'https://search.google.com/search-console',
      testLabel: 'Open Search Console',
      lastCheckedAt: checkedAt,
    },
    {
      id: 'google_reviews',
      label: 'Google Reviews / Business Profile',
      status: googlePlacesKey
        ? googleReviewUrl
          ? 'connected'
          : 'needs_verification'
        : 'needs_oauth',
      maskedId: googlePlaceId ? maskIntegrationId(getConfiguredGooglePlaceId()) : 'Auto-discover via Places',
      description: 'Sync Google reviews into customer_reviews and power homepage trust.',
      setupInstructions: googlePlacesKey
        ? [
            'GOOGLE_PLACES_API_KEY enables review sync (not full Business Profile OAuth yet).',
            'Save a public Google review URL for Leave a Review CTAs.',
            'Use Sync on this page or CMS to import latest reviews.',
          ]
        : [
            'Add GOOGLE_PLACES_API_KEY in Vercel.',
            'Optionally set GOOGLE_PLACE_ID for a fixed business location.',
            'Full Business Profile OAuth roadmap — manual import works today.',
          ],
      testHref: googleReviewUrl || 'https://business.google.com/',
      testLabel: googleReviewUrl ? 'Open review link' : 'Open Business Profile',
      lastCheckedAt: checkedAt,
    },
    {
      id: 'google_tag',
      label: 'Google Tag on site',
      status: gaTagInstalled ? 'configured' : 'missing',
      maskedId: maskIntegrationId(gaMeasurementId),
      description: 'gtag.js measurement ID embedded in root layout.',
      setupInstructions: [
        'Rendered by src/components/analytics/site-analytics.tsx.',
        'Also configurable in Brand Settings / workspace ga_measurement_id.',
      ],
      testHref: ws.websiteUrl || 'https://www.glossbossatx.com',
      testLabel: 'View live site',
      lastCheckedAt: checkedAt,
    },
    {
      id: 'sitemap_robots',
      label: 'Sitemap / robots.txt',
      status: sitemapPresent && robotsPresent ? 'configured' : sitemapPresent || robotsPresent ? 'configured' : 'missing',
      maskedId: [sitemapPresent ? 'sitemap' : null, robotsPresent ? 'robots' : null].filter(Boolean).join(' + ') || null,
      description: 'Helps search engines crawl and index your pages.',
      setupInstructions: [
        sitemapPresent ? 'Sitemap file detected in repo.' : 'Add public/sitemap.xml or src/app/sitemap.ts.',
        robotsPresent ? 'robots.txt detected.' : 'Add public/robots.txt or src/app/robots.ts.',
        'Submit sitemap URL in Search Console after verification.',
      ],
      testHref: `${gscPropertyUrl.replace(/\/$/, '')}/sitemap.xml`,
      testLabel: 'Try sitemap URL',
      lastCheckedAt: checkedAt,
    },
  ];

  const recommendations = buildRecommendations({
    gaDataApiConnected,
    gaTagInstalled,
    clarityScriptInstalled,
    gscVerified,
    sitemapPresent,
    publishedReviewCount,
    heroVideoEnabled: ws.heroVideoEnabled === true,
    gaMetrics,
    recentBookings7d: bookingsRes.count ?? 0,
  });

  return {
    checkedAt,
    workspace: {
      gaMeasurementId,
      clarityProjectId,
      websiteUrl: ws.websiteUrl,
      publicBookingUrl: ws.publicBookingUrl,
      heroVideoEnabled: ws.heroVideoEnabled,
      gscVerificationNote: ws.gscVerificationNote,
      gscVerified,
      gscPropertyUrl,
      gscLastVerifiedAt: ws.gscLastVerifiedAt ?? null,
    },
    integrations,
    gaTagInstalled,
    gaDataApiConnected,
    gaDataApiError,
    gaMetrics,
    clarityScriptInstalled,
    clarityApiConfigured,
    searchConsoleApiConfigured,
    googleReviewsApiReady: googlePlacesKey,
    googleReviewUrl,
    googleReviewsLastSyncAt,
    reviews,
    publishedReviewCount,
    homepageVisibleReviewCount,
    googleReviewsStoredCount,
    averageRating,
    sitemapPresent,
    robotsPresent,
    recentBookings7d: bookingsRes.count ?? 0,
    recommendations,
  };
}

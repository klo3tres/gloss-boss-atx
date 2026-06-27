export type IntegrationCardStatus =
  | 'configured'
  | 'missing'
  | 'needs_oauth'
  | 'needs_verification'
  | 'connected';

export type IntegrationCard = {
  id: string;
  label: string;
  status: IntegrationCardStatus;
  maskedId: string | null;
  description: string;
  setupInstructions: string[];
  testHref: string | null;
  testLabel: string | null;
  lastCheckedAt: string;
};

export type TitanWebsiteRecommendation = {
  id: string;
  tone: 'info' | 'action' | 'success' | 'warning';
  title: string;
  detail: string;
  href?: string;
};

export type ReviewIntelRow = {
  id: string;
  customer_name: string;
  rating: number;
  testimonial: string;
  source: string;
  published: boolean;
  featured: boolean;
  created_at: string;
  google_review_id?: string | null;
};

export type GaTrafficMetrics = {
  periodDays: 7 | 28;
  users: number;
  sessions: number;
  views: number;
  topPages: { path: string; views: number }[];
  trafficSources: { source: string; sessions: number }[];
  conversions?: { event: string; count: number }[];
};

export type WebsiteIntelligenceBundle = {
  checkedAt: string;
  workspace: {
    gaMeasurementId?: string | null;
    clarityProjectId?: string | null;
    websiteUrl?: string | null;
    publicBookingUrl?: string | null;
    heroVideoEnabled?: boolean;
    gscVerificationNote?: string | null;
    gscVerified?: boolean;
    gscPropertyUrl?: string | null;
    gscLastVerifiedAt?: string | null;
  };
  integrations: IntegrationCard[];
  gaTagInstalled: boolean;
  gaDataApiConnected: boolean;
  gaDataApiError: string | null;
  gaMetrics: { metrics7: GaTrafficMetrics; metrics28: GaTrafficMetrics } | null;
  clarityScriptInstalled: boolean;
  clarityApiConfigured: boolean;
  searchConsoleApiConfigured: boolean;
  googleReviewsApiReady: boolean;
  googleReviewUrl: string;
  googleReviewsLastSyncAt: string | null;
  reviews: ReviewIntelRow[];
  publishedReviewCount: number;
  averageRating: number | null;
  sitemapPresent: boolean;
  robotsPresent: boolean;
  recentBookings7d: number;
  recommendations: TitanWebsiteRecommendation[];
};

export type WebsiteIntelligenceSummary = {
  gaConfigured: boolean;
  clarityConfigured: boolean;
  searchConsoleVerified: boolean;
  reviewsVisible: boolean;
};

export function maskIntegrationId(value: string | null | undefined, visibleTail = 4): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (raw.length <= visibleTail + 2) return raw;
  return `${raw.slice(0, 2)}···${raw.slice(-visibleTail)}`;
}

export function integrationStatusLabel(status: IntegrationCardStatus): string {
  switch (status) {
    case 'configured':
      return 'Configured';
    case 'connected':
      return 'Connected';
    case 'needs_oauth':
      return 'Needs OAuth / API';
    case 'needs_verification':
      return 'Needs verification';
    default:
      return 'Missing';
  }
}

export function summarizeWebsiteIntelligence(bundle: WebsiteIntelligenceBundle): WebsiteIntelligenceSummary {
  return {
    gaConfigured: bundle.gaTagInstalled,
    clarityConfigured: bundle.clarityScriptInstalled,
    searchConsoleVerified: bundle.workspace.gscVerified === true,
    reviewsVisible: bundle.publishedReviewCount > 0,
  };
}

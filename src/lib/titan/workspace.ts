import type { SupabaseClient } from '@supabase/supabase-js';

import type { MapProviderId } from '@/lib/integrations/maps-discovery-status';

export type TitanIndustry =
  | 'mobile_detailing'
  | 'pressure_washing'
  | 'landscaping'
  | 'mobile_mechanic'
  | 'cleaning'
  | 'other';

export type TitanWorkspace = {
  businessName: string;
  ownerDisplayName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  industry: TitanIndustry;
  businessType: string;
  revenueModel: string;
  serviceRadiusMiles: number;
  employeeCount: number;
  operatingHours: Record<string, string>;
  monthlyRevenueGoalCents: number;
  updatedAt: string | null;
  publicWidgetEnabled: boolean;
  operatorAssistantEnabled: boolean;
  poweredByBrandingEnabled: boolean;
  demoMode: boolean;
  onboardingStep: number;
  onboardingCompletedAt: string | null;
  subscriptionTier: string;
  subscriptionStatus: string | null;
  mapProvider: MapProviderId;
  workspaceSlug?: string;
  businessDisplayName?: string | null;
  legalBusinessName?: string | null;
  brandShortName?: string | null;
  brandCityLabel?: string | null;
  brandSlug?: string | null;
  logoUrl?: string | null;
  iconUrl?: string | null;
  heroVideoUrl?: string | null;
  heroVideoPosterUrl?: string | null;
  heroVideoEnabled?: boolean;
  primaryColor?: string;
  accentColor?: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
  websiteUrl?: string | null;
  publicBookingUrl?: string | null;
  gaMeasurementId?: string | null;
  clarityProjectId?: string | null;
  gscVerificationNote?: string | null;
  gscVerified?: boolean;
  gscPropertyUrl?: string | null;
  gscLastVerifiedAt?: string | null;
  isTitanPlatformMode?: boolean;
  publicTitanEnabled?: boolean;
  allowedDomains?: string[];
  googleBlocksBooking?: boolean;
  calendarLastPullAt?: string | null;
};

const DEFAULT_HOURS: Record<string, string> = {
  mon: '8-18',
  tue: '8-18',
  wed: '8-18',
  thu: '8-18',
  fri: '8-18',
  sat: '9-14',
  sun: 'closed',
};

export const INDUSTRY_LABELS: Record<TitanIndustry, string> = {
  mobile_detailing: 'Mobile detailing',
  pressure_washing: 'Pressure washing',
  landscaping: 'Landscaping',
  mobile_mechanic: 'Mobile mechanic',
  cleaning: 'Cleaning services',
  other: 'Other service business',
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function defaults(): TitanWorkspace {
  return {
    businessName: 'Gloss Boss ATX',
    ownerDisplayName: null,
    ownerEmail: null,
    ownerPhone: null,
    industry: 'mobile_detailing',
    businessType: 'owner_operator',
    revenueModel: 'per_job',
    serviceRadiusMiles: Number(process.env.TITAN_DISCOVERY_RADIUS_MILES ?? 15),
    employeeCount: 1,
    operatingHours: { ...DEFAULT_HOURS },
    monthlyRevenueGoalCents: 0,
    updatedAt: null,
    publicWidgetEnabled: true,
    operatorAssistantEnabled: true,
    poweredByBrandingEnabled: true,
    demoMode: false,
    onboardingStep: 0,
    onboardingCompletedAt: null,
    subscriptionTier: 'none',
    subscriptionStatus: null,
    mapProvider: 'list_only',
    workspaceSlug: 'gloss-boss-atx',
    businessDisplayName: 'Gloss Boss ATX',
    legalBusinessName: 'Gloss Boss ATX LLC',
    brandShortName: 'Gloss Boss',
    brandCityLabel: 'Austin, TX',
    brandSlug: 'gloss-boss-atx',
    logoUrl: null,
    iconUrl: null,
    heroVideoUrl: null,
    heroVideoPosterUrl: null,
    heroVideoEnabled: false,
    primaryColor: '#d4af37',
    accentColor: '#f1d28a',
    supportEmail: null,
    supportPhone: null,
    websiteUrl: 'https://www.glossbossatx.com',
    publicBookingUrl: 'https://www.glossbossatx.com/book',
    gaMeasurementId: 'G-VWFWQ0P9GB',
    clarityProjectId: 'xddon9jp0d',
    gscVerificationNote: null,
    gscVerified: false,
    gscPropertyUrl: 'https://www.glossbossatx.com/',
    gscLastVerifiedAt: null,
    isTitanPlatformMode: false,
    publicTitanEnabled: true,
    allowedDomains: [],
    googleBlocksBooking: true,
    calendarLastPullAt: null,
  };
}

function mapRow(row: Record<string, unknown>): TitanWorkspace {
  const hours = row.operating_hours;
  return {
    businessName: str(row.business_name) || 'My Business',
    ownerDisplayName: str(row.owner_display_name) || null,
    ownerEmail: str(row.owner_email) || null,
    ownerPhone: str(row.owner_phone) || null,
    industry: (str(row.industry) || 'mobile_detailing') as TitanIndustry,
    businessType: str(row.business_type) || 'service',
    revenueModel: str(row.revenue_model) || 'per_job',
    serviceRadiusMiles: Number(row.service_radius_miles ?? 15),
    employeeCount: Number(row.employee_count ?? 1),
    operatingHours:
      hours && typeof hours === 'object' && !Array.isArray(hours)
        ? (hours as Record<string, string>)
        : { ...DEFAULT_HOURS },
    monthlyRevenueGoalCents: Number(row.monthly_revenue_goal_cents ?? 0),
    updatedAt: str(row.updated_at) || null,
    publicWidgetEnabled: row.public_widget_enabled !== false,
    operatorAssistantEnabled: row.operator_assistant_enabled !== false,
    poweredByBrandingEnabled: row.powered_by_branding_enabled !== false,
    demoMode: row.demo_mode === true,
    onboardingStep: Number(row.onboarding_step ?? 0),
    onboardingCompletedAt: str(row.onboarding_completed_at) || null,
    subscriptionTier: str(row.subscription_tier) || 'none',
    subscriptionStatus: str(row.subscription_status) || null,
    mapProvider: (['google_maps', 'apple_mapkit', 'list_only'].includes(str(row.map_provider))
      ? str(row.map_provider)
      : 'list_only') as MapProviderId,
    workspaceSlug: str(row.workspace_slug) || 'gloss-boss-atx',
    businessDisplayName: str(row.business_display_name) || null,
    legalBusinessName: str(row.legal_business_name) || null,
    brandShortName: str(row.brand_short_name) || null,
    brandCityLabel: str(row.brand_city_label) || null,
    brandSlug: str(row.brand_slug) || null,
    logoUrl: str(row.logo_url) || null,
    iconUrl: str(row.icon_url) || null,
    heroVideoUrl: str(row.hero_video_url) || null,
    heroVideoPosterUrl: str(row.hero_video_poster_url) || null,
    heroVideoEnabled: row.hero_video_enabled === true,
    primaryColor: str(row.primary_color) || '#d4af37',
    accentColor: str(row.accent_color) || '#f1d28a',
    supportEmail: str(row.support_email) || null,
    supportPhone: str(row.support_phone) || null,
    websiteUrl: str(row.website_url) || null,
    publicBookingUrl: str(row.public_booking_url) || null,
    gaMeasurementId: str(row.ga_measurement_id) || null,
    clarityProjectId: str(row.clarity_project_id) || null,
    gscVerificationNote: str(row.gsc_verification_note) || null,
    gscVerified: row.gsc_verified === true,
    gscPropertyUrl: str(row.gsc_property_url) || null,
    gscLastVerifiedAt: str(row.gsc_last_verified_at) || null,
    isTitanPlatformMode: row.is_titan_platform_mode === true,
    publicTitanEnabled: row.public_titan_enabled !== false,
    allowedDomains: Array.isArray(row.allowed_domains) ? (row.allowed_domains as string[]) : [],
    googleBlocksBooking: row.google_blocks_booking !== false,
    calendarLastPullAt: str(row.calendar_last_pull_at) || null,
  };
}

export async function loadTitanWorkspace(admin: SupabaseClient): Promise<TitanWorkspace & { tablesReady: boolean }> {
  const probe = await admin.from('titan_workspace_settings').select('workspace_key').limit(1);
  if (probe.error) return { ...defaults(), tablesReady: false };

  const { data } = await admin.from('titan_workspace_settings').select('*').eq('workspace_key', 'default').maybeSingle();
  if (!data) return { ...defaults(), tablesReady: true };
  return { ...mapRow(data as Record<string, unknown>), tablesReady: true };
}

export async function saveTitanWorkspace(admin: SupabaseClient, input: Partial<TitanWorkspace>) {
  const now = new Date().toISOString();
  const current = await loadTitanWorkspace(admin);
  const merged: TitanWorkspace = {
    businessName: input.businessName ?? current.businessName,
    ownerDisplayName: input.ownerDisplayName !== undefined ? input.ownerDisplayName : current.ownerDisplayName,
    ownerEmail: input.ownerEmail !== undefined ? input.ownerEmail : current.ownerEmail,
    ownerPhone: input.ownerPhone !== undefined ? input.ownerPhone : current.ownerPhone,
    industry: input.industry ?? current.industry,
    businessType: input.businessType ?? current.businessType,
    revenueModel: input.revenueModel ?? current.revenueModel,
    serviceRadiusMiles: input.serviceRadiusMiles ?? current.serviceRadiusMiles,
    employeeCount: input.employeeCount ?? current.employeeCount,
    operatingHours: input.operatingHours ?? current.operatingHours,
    monthlyRevenueGoalCents: input.monthlyRevenueGoalCents ?? current.monthlyRevenueGoalCents,
    updatedAt: now,
    publicWidgetEnabled: input.publicWidgetEnabled ?? current.publicWidgetEnabled,
    operatorAssistantEnabled: input.operatorAssistantEnabled ?? current.operatorAssistantEnabled,
    poweredByBrandingEnabled: input.poweredByBrandingEnabled ?? current.poweredByBrandingEnabled,
    demoMode: input.demoMode ?? current.demoMode,
    onboardingStep: input.onboardingStep ?? current.onboardingStep,
    onboardingCompletedAt: input.onboardingCompletedAt ?? current.onboardingCompletedAt,
    subscriptionTier: input.subscriptionTier ?? current.subscriptionTier,
    subscriptionStatus: input.subscriptionStatus ?? current.subscriptionStatus,
    mapProvider: input.mapProvider ?? current.mapProvider,
    workspaceSlug: input.workspaceSlug ?? current.workspaceSlug,
    businessDisplayName: input.businessDisplayName !== undefined ? input.businessDisplayName : current.businessDisplayName,
    legalBusinessName: input.legalBusinessName !== undefined ? input.legalBusinessName : current.legalBusinessName,
    brandShortName: input.brandShortName !== undefined ? input.brandShortName : current.brandShortName,
    brandCityLabel: input.brandCityLabel !== undefined ? input.brandCityLabel : current.brandCityLabel,
    brandSlug: input.brandSlug !== undefined ? input.brandSlug : current.brandSlug,
    logoUrl: input.logoUrl !== undefined ? input.logoUrl : current.logoUrl,
    iconUrl: input.iconUrl !== undefined ? input.iconUrl : current.iconUrl,
    heroVideoUrl: input.heroVideoUrl !== undefined ? input.heroVideoUrl : current.heroVideoUrl,
    heroVideoPosterUrl: input.heroVideoPosterUrl !== undefined ? input.heroVideoPosterUrl : current.heroVideoPosterUrl,
    heroVideoEnabled: input.heroVideoEnabled ?? current.heroVideoEnabled,
    primaryColor: input.primaryColor ?? current.primaryColor,
    accentColor: input.accentColor ?? current.accentColor,
    supportEmail: input.supportEmail !== undefined ? input.supportEmail : current.supportEmail,
    supportPhone: input.supportPhone !== undefined ? input.supportPhone : current.supportPhone,
    websiteUrl: input.websiteUrl !== undefined ? input.websiteUrl : current.websiteUrl,
    publicBookingUrl: input.publicBookingUrl !== undefined ? input.publicBookingUrl : current.publicBookingUrl,
    gaMeasurementId: input.gaMeasurementId !== undefined ? input.gaMeasurementId : current.gaMeasurementId,
    clarityProjectId: input.clarityProjectId !== undefined ? input.clarityProjectId : current.clarityProjectId,
    gscVerificationNote: input.gscVerificationNote !== undefined ? input.gscVerificationNote : current.gscVerificationNote,
    gscVerified: input.gscVerified ?? current.gscVerified,
    gscPropertyUrl: input.gscPropertyUrl !== undefined ? input.gscPropertyUrl : current.gscPropertyUrl,
    gscLastVerifiedAt: input.gscLastVerifiedAt !== undefined ? input.gscLastVerifiedAt : current.gscLastVerifiedAt,
    isTitanPlatformMode: input.isTitanPlatformMode ?? current.isTitanPlatformMode,
    publicTitanEnabled: input.publicTitanEnabled ?? current.publicTitanEnabled,
    allowedDomains: input.allowedDomains ?? current.allowedDomains,
    googleBlocksBooking: input.googleBlocksBooking ?? current.googleBlocksBooking,
    calendarLastPullAt: input.calendarLastPullAt !== undefined ? input.calendarLastPullAt : current.calendarLastPullAt,
  };

  const { error } = await admin.from('titan_workspace_settings').upsert(
    {
      workspace_key: 'default',
      business_name: merged.businessName,
      owner_display_name: merged.ownerDisplayName,
      owner_email: merged.ownerEmail,
      owner_phone: merged.ownerPhone,
      industry: merged.industry,
      business_type: merged.businessType,
      revenue_model: merged.revenueModel,
      service_radius_miles: merged.serviceRadiusMiles,
      employee_count: merged.employeeCount,
      operating_hours: merged.operatingHours,
      monthly_revenue_goal_cents: merged.monthlyRevenueGoalCents,
      public_widget_enabled: merged.publicWidgetEnabled,
      operator_assistant_enabled: merged.operatorAssistantEnabled,
      powered_by_branding_enabled: merged.poweredByBrandingEnabled,
      demo_mode: merged.demoMode,
      onboarding_step: merged.onboardingStep,
      onboarding_completed_at: merged.onboardingCompletedAt,
      subscription_tier: merged.subscriptionTier,
      subscription_status: merged.subscriptionStatus,
      map_provider: merged.mapProvider,
      workspace_slug: merged.workspaceSlug,
      business_display_name: merged.businessDisplayName,
      legal_business_name: merged.legalBusinessName,
      brand_short_name: merged.brandShortName,
      brand_city_label: merged.brandCityLabel,
      brand_slug: merged.brandSlug,
      logo_url: merged.logoUrl,
      icon_url: merged.iconUrl,
      hero_video_url: merged.heroVideoUrl,
      hero_video_poster_url: merged.heroVideoPosterUrl,
      hero_video_enabled: merged.heroVideoEnabled,
      primary_color: merged.primaryColor,
      accent_color: merged.accentColor,
      support_email: merged.supportEmail,
      support_phone: merged.supportPhone,
      website_url: merged.websiteUrl,
      public_booking_url: merged.publicBookingUrl,
      ga_measurement_id: merged.gaMeasurementId,
      clarity_project_id: merged.clarityProjectId,
      gsc_verification_note: merged.gscVerificationNote,
      gsc_verified: merged.gscVerified === true,
      gsc_property_url: merged.gscPropertyUrl,
      gsc_last_verified_at: merged.gscLastVerifiedAt,
      is_titan_platform_mode: merged.isTitanPlatformMode,
      public_titan_enabled: merged.publicTitanEnabled,
      allowed_domains: merged.allowedDomains,
      google_blocks_booking: merged.googleBlocksBooking,
      calendar_last_pull_at: merged.calendarLastPullAt,
      updated_at: now,
    },
    { onConflict: 'workspace_key' },
  );

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, workspace: merged };
}

/** Radius for Places discovery — workspace overrides env default. */
export function workspaceDiscoveryRadiusMiles(workspace: TitanWorkspace): number {
  return workspace.serviceRadiusMiles > 0 ? workspace.serviceRadiusMiles : 15;
}

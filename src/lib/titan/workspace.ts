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
  };
}

function mapRow(row: Record<string, unknown>): TitanWorkspace {
  const hours = row.operating_hours;
  return {
    businessName: str(row.business_name) || 'My Business',
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
  };

  const { error } = await admin.from('titan_workspace_settings').upsert(
    {
      workspace_key: 'default',
      business_name: merged.businessName,
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

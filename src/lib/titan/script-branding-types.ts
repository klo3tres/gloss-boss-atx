import type { OpportunityScriptContext } from '@/lib/opportunity-pipeline-scripts';

export type ScriptBranding = {
  brandName: string;
  repName: string;
  serviceArea: string;
  websiteUrl: string | null;
};

export function brandingToScriptContext(
  branding: Partial<ScriptBranding> | null | undefined,
  extra: OpportunityScriptContext = {},
): OpportunityScriptContext {
  return {
    ...extra,
    brandName: branding?.brandName,
    repName: branding?.repName,
    serviceArea: branding?.serviceArea,
    websiteUrl: branding?.websiteUrl,
    businessName: extra.businessName ?? branding?.brandName,
  };
}

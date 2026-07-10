import type { SupabaseClient } from '@supabase/supabase-js';
import { loadWorkspaceBrand, publicBrandPayload } from '@/lib/brand/workspace-brand';
import { resolveBusinessContext } from '@/lib/titan/business-context';
import type { ScriptBranding } from '@/lib/titan/script-branding-types';

export type { ScriptBranding } from '@/lib/titan/script-branding-types';
export { brandingToScriptContext } from '@/lib/titan/script-branding-types';

const DEFAULT_BRANDING: ScriptBranding = {
  brandName: 'Gloss Boss ATX',
  repName: 'Kyle',
  serviceArea: 'Austin / Round Rock',
  websiteUrl: 'https://www.glossbossatx.com',
};

export async function loadScriptBranding(admin: SupabaseClient): Promise<ScriptBranding> {
  try {
    const [brand, ctx] = await Promise.all([loadWorkspaceBrand(admin), resolveBusinessContext(admin)]);
    const pub = publicBrandPayload(brand);
    const businessName = ctx?.business.name || pub.businessDisplayName || DEFAULT_BRANDING.brandName;
    const area = pub.brandCityLabel || DEFAULT_BRANDING.serviceArea;
    return {
      brandName: businessName,
      repName: DEFAULT_BRANDING.repName,
      serviceArea: area.includes('Austin') ? area : `${area} area`,
      websiteUrl: ctx?.business.websiteUrl || pub.websiteUrl || DEFAULT_BRANDING.websiteUrl,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}

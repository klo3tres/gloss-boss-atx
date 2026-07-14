import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicBrandPayload } from '@/lib/brand/public-brand-types';
import { DEFAULT_WORKSPACE_KEY } from '@/lib/titan/workspace-keys';

export type WorkspaceBrand = {
  workspaceKey: string;
  businessDisplayName: string;
  legalBusinessName: string;
  brandShortName: string;
  brandCityLabel: string;
  brandSlug: string;
  logoUrl: string | null;
  iconUrl: string | null;
  heroImageUrl: string | null;
  heroVideoUrl: string | null;
  heroVideoPosterUrl: string | null;
  heroVideoEnabled: boolean;
  primaryColor: string;
  accentColor: string;
  supportEmail: string | null;
  supportPhone: string | null;
  websiteUrl: string;
  publicBookingUrl: string;
  gaMeasurementId: string | null;
  clarityProjectId: string | null;
  gscVerificationNote: string | null;
  googleBlocksBooking: boolean;
};

const FALLBACKS: WorkspaceBrand = {
  workspaceKey: DEFAULT_WORKSPACE_KEY,
  businessDisplayName: 'Gloss Boss ATX',
  legalBusinessName: 'Gloss Boss ATX',
  brandShortName: 'Gloss Boss',
  brandCityLabel: 'Austin, TX',
  brandSlug: 'gloss-boss-atx',
  logoUrl: '/brand/glossboss-clean-logo.png',
  iconUrl: '/favicon.svg',
  heroImageUrl: null,
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
  googleBlocksBooking: true,
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function isPlaceholderBusinessName(name: string) {
  return !name || /^my business$/i.test(name) || /^my business\b/i.test(name);
}

function resolveBusinessName(rawBusiness: string, rawDisplay: string) {
  const businessName = isPlaceholderBusinessName(rawBusiness) ? FALLBACKS.businessDisplayName : rawBusiness;
  const displayName = isPlaceholderBusinessName(rawDisplay) ? businessName : rawDisplay;
  return { businessName, displayName };
}

function resolveBrandShortName(raw: string, displayName: string) {
  if (isPlaceholderBusinessName(raw) || !raw) {
    return displayName.replace(/\s+ATX$/i, '').trim() || FALLBACKS.brandShortName;
  }
  return raw;
}

export function mapWorkspaceBrandRow(row: Record<string, unknown> | null | undefined): WorkspaceBrand {
  if (!row) return { ...FALLBACKS };
  const { businessName, displayName } = resolveBusinessName(
    str(row.business_name),
    str(row.business_display_name),
  );
  const legalName = str(row.legal_business_name);
  return {
    workspaceKey: str(row.workspace_key) || DEFAULT_WORKSPACE_KEY,
    businessDisplayName: displayName,
    legalBusinessName: isPlaceholderBusinessName(legalName) ? businessName : legalName,
    brandShortName: resolveBrandShortName(str(row.brand_short_name), displayName),
    brandCityLabel: str(row.brand_city_label) || 'Austin, TX',
    brandSlug: str(row.brand_slug) || 'gloss-boss-atx',
    logoUrl: str(row.logo_url) || FALLBACKS.logoUrl,
    iconUrl: str(row.icon_url) || FALLBACKS.iconUrl,
    heroImageUrl: null,
    heroVideoUrl: str(row.hero_video_url) || null,
    heroVideoPosterUrl: str(row.hero_video_poster_url) || null,
    heroVideoEnabled: row.hero_video_enabled === true,
    primaryColor: str(row.primary_color) || FALLBACKS.primaryColor,
    accentColor: str(row.accent_color) || FALLBACKS.accentColor,
    supportEmail: str(row.support_email) || str(row.owner_email) || null,
    supportPhone: str(row.support_phone) || str(row.owner_phone) || null,
    websiteUrl: str(row.website_url) || FALLBACKS.websiteUrl,
    publicBookingUrl: str(row.public_booking_url) || FALLBACKS.publicBookingUrl,
    gaMeasurementId: str(row.ga_measurement_id) || null,
    clarityProjectId: str(row.clarity_project_id) || null,
    gscVerificationNote: str(row.gsc_verification_note) || null,
    googleBlocksBooking: row.google_blocks_booking !== false,
  };
}

export async function loadWorkspaceBrand(admin: SupabaseClient, workspaceKey = DEFAULT_WORKSPACE_KEY): Promise<WorkspaceBrand & { tablesReady: boolean }> {
  const probe = await admin.from('titan_workspace_settings').select('workspace_key').limit(1);
  if (probe.error) return { ...FALLBACKS, tablesReady: false };

  const { data } = await admin.from('titan_workspace_settings').select('*').eq('workspace_key', workspaceKey).maybeSingle();
  if (!data) return { ...FALLBACKS, tablesReady: true };

  let brand = mapWorkspaceBrandRow(data as Record<string, unknown>);

  const { data: heroImageAsset } = await admin
    .from('site_media_assets')
    .select('public_url, external_url, is_active')
    .eq('workspace_key', workspaceKey)
    .eq('placement', 'homepage_hero_image')
    .eq('media_type', 'image')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: heroVideoAsset } = await admin
    .from('site_media_assets')
    .select('public_url, poster_url, external_url, is_active')
    .eq('workspace_key', workspaceKey)
    .eq('placement', 'homepage_hero_video')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const selectedImageUrl = heroImageAsset
    ? str((heroImageAsset as { public_url?: string }).public_url) || str((heroImageAsset as { external_url?: string }).external_url)
    : '';
  if (selectedImageUrl) {
    brand = { ...brand, heroImageUrl: selectedImageUrl, heroVideoEnabled: false };
  } else if (heroVideoAsset) {
    const asset = heroVideoAsset as { public_url?: string; external_url?: string; poster_url?: string; is_active?: boolean };
    const videoUrl = str(asset.public_url) || str(asset.external_url);
    if (videoUrl) {
      brand = {
        ...brand,
        heroVideoUrl: videoUrl,
        heroVideoPosterUrl: str(asset.poster_url) || brand.heroVideoPosterUrl,
        heroVideoEnabled: true,
      };
    }
  }

  const { data: logoAsset } = await admin
    .from('site_media_assets')
    .select('public_url, external_url')
    .eq('workspace_key', workspaceKey)
    .eq('placement', 'brand_logo')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (logoAsset) {
    const url = str((logoAsset as { public_url?: string }).public_url) || str((logoAsset as { external_url?: string }).external_url);
    if (url) brand = { ...brand, logoUrl: url };
  }

  return { ...brand, tablesReady: true };
}

/** Public-safe brand payload — no secrets, no owner PII beyond support contact. */
export function publicBrandPayload(brand: WorkspaceBrand): PublicBrandPayload {
  const displayName = isPlaceholderBusinessName(brand.businessDisplayName)
    ? FALLBACKS.businessDisplayName
    : brand.businessDisplayName;
  const shortName = resolveBrandShortName(brand.brandShortName, displayName);
  return {
    businessDisplayName: displayName,
    brandShortName: shortName,
    brandCityLabel: brand.brandCityLabel,
    logoUrl: brand.logoUrl,
    iconUrl: brand.iconUrl,
    heroImageUrl: brand.heroImageUrl,
    heroVideoUrl: brand.heroVideoEnabled ? brand.heroVideoUrl : null,
    heroVideoPosterUrl: brand.heroVideoPosterUrl,
    heroVideoEnabled: brand.heroVideoEnabled,
    primaryColor: brand.primaryColor,
    accentColor: brand.accentColor,
    supportEmail: brand.supportEmail,
    supportPhone: brand.supportPhone,
    websiteUrl: brand.websiteUrl,
    publicBookingUrl: brand.publicBookingUrl,
  };
}

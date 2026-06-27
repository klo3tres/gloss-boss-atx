'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { DEFAULT_WORKSPACE_KEY } from '@/lib/titan/workspace-keys';

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) return null;
  return { admin };
}

export async function saveBrandSettingsAction(input: {
  businessDisplayName: string;
  legalBusinessName: string;
  brandShortName: string;
  brandCityLabel: string;
  brandSlug: string;
  logoUrl: string;
  iconUrl: string;
  heroVideoUrl: string;
  heroVideoPosterUrl: string;
  heroVideoEnabled: boolean;
  primaryColor: string;
  accentColor: string;
  supportEmail: string;
  supportPhone: string;
  websiteUrl: string;
  publicBookingUrl: string;
  gaMeasurementId: string;
  clarityProjectId: string;
  gscVerificationNote: string;
}) {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };

  const admin = g.admin;

  const now = new Date().toISOString();
  const { error } = await admin
    .from('titan_workspace_settings')
    .upsert(
      {
        workspace_key: DEFAULT_WORKSPACE_KEY,
        business_name: input.businessDisplayName.trim(),
        business_display_name: input.businessDisplayName.trim(),
        legal_business_name: input.legalBusinessName.trim(),
        brand_short_name: input.brandShortName.trim(),
        brand_city_label: input.brandCityLabel.trim(),
        brand_slug: input.brandSlug.trim(),
        logo_url: input.logoUrl.trim() || null,
        icon_url: input.iconUrl.trim() || null,
        hero_video_url: input.heroVideoUrl.trim() || null,
        hero_video_poster_url: input.heroVideoPosterUrl.trim() || null,
        hero_video_enabled: input.heroVideoEnabled,
        primary_color: input.primaryColor.trim() || '#d4af37',
        accent_color: input.accentColor.trim() || '#f1d28a',
        support_email: input.supportEmail.trim() || null,
        support_phone: input.supportPhone.trim() || null,
        website_url: input.websiteUrl.trim() || null,
        public_booking_url: input.publicBookingUrl.trim() || null,
        ga_measurement_id: input.gaMeasurementId.trim() || null,
        clarity_project_id: input.clarityProjectId.trim() || null,
        gsc_verification_note: input.gscVerificationNote.trim() || null,
        updated_at: now,
      },
      { onConflict: 'workspace_key' },
    );

  if (error) return { error: error.message };

  revalidatePath('/admin/brand-settings');
  revalidatePath('/admin/setup-center');
  revalidatePath('/');
  revalidatePath('/services');
  revalidatePath('/book');
  return { ok: true as const };
}

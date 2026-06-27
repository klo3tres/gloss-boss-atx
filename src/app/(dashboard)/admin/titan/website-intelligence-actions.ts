'use server';

import { revalidatePath } from 'next/cache';
import { saveManualReviewAction, deleteManualReviewAction } from '@/lib/admin/review-manager-actions';
import { syncGoogleReviewsAction } from '@/lib/admin/sync-google-reviews-action';
import { saveTitanWorkspace } from '@/lib/titan/workspace';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export type WebsiteIntelActionResult = { ok: boolean; error?: string; message?: string };

function str(v: FormDataEntryValue | null) {
  return v == null ? '' : String(v).trim();
}

export async function saveSearchConsoleSettingsAction(formData: FormData): Promise<WebsiteIntelActionResult> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, error: 'Admin database client unavailable.' };

  const verified = formData.get('gsc_verified') === 'on' || formData.get('gsc_verified') === 'true';
  const propertyUrl = str(formData.get('gsc_property_url')) || null;
  const note = str(formData.get('gsc_verification_note')) || null;
  const lastVerifiedInput = str(formData.get('gsc_last_verified_at'));
  const lastVerifiedAt = verified
    ? lastVerifiedInput
      ? new Date(lastVerifiedInput.includes('T') ? lastVerifiedInput : `${lastVerifiedInput}T12:00:00`).toISOString()
      : new Date().toISOString()
    : null;

  const res = await saveTitanWorkspace(admin, {
    gscVerified: verified,
    gscPropertyUrl: propertyUrl,
    gscVerificationNote: note,
    gscLastVerifiedAt: lastVerifiedAt,
  });

  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath('/admin/titan/website-intelligence');
  revalidatePath('/admin/setup-center');
  return { ok: true, message: verified ? 'Search Console marked verified.' : 'Search Console settings saved.' };
}

export { saveManualReviewAction, deleteManualReviewAction, syncGoogleReviewsAction };

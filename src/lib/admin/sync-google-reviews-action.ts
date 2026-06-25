'use server';

import { revalidatePath } from 'next/cache';
import { syncGoogleReviewsToDatabase, type SyncGoogleReviewsResult } from '@/lib/google/google-place-reviews';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export type GoogleReviewSyncActionResult = SyncGoogleReviewsResult & {
  message?: string;
};

function formatMessage(result: SyncGoogleReviewsResult): string {
  if (!result.ok) return result.error ?? 'Google review sync failed.';
  const parts = [
    result.imported ? `${result.imported} imported` : '',
    result.updated ? `${result.updated} updated` : '',
    result.skipped ? `${result.skipped} skipped` : '',
  ].filter(Boolean);
  if (parts.length === 0 && result.totalFromGoogle === 0) {
    return 'Google returned no reviews for this business yet.';
  }
  return `Synced ${result.totalFromGoogle} Google review(s): ${parts.join(', ') || 'no changes'}.`;
}

export async function syncGoogleReviewsAction(): Promise<GoogleReviewSyncActionResult> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, imported: 0, updated: 0, skipped: 0, totalFromGoogle: 0, error: 'Admin database client unavailable.' };

  const result = await syncGoogleReviewsToDatabase(admin);
  if (result.ok) {
    revalidatePath('/');
    revalidatePath('/admin/cms');
    revalidatePath('/admin/reviews');
    revalidatePath('/api/public/site-data');
  }

  return { ...result, message: formatMessage(result) };
}

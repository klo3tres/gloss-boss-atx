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
    revalidatePath('/admin/titan/website-intelligence');
    revalidatePath('/api/public/site-data');
    const { emitOwnerNotification } = await import('@/lib/titan/owner-notification-router');
    void emitOwnerNotification(admin, {
      eventType: 'new_booking',
      title: 'Google reviews synced',
      body: formatMessage(result),
      source: 'google_reviews',
      relatedUrl: '/admin/reviews',
    });
  } else {
    const { emitOwnerNotification } = await import('@/lib/titan/owner-notification-router');
    void emitOwnerNotification(admin, {
      eventType: 'delivery_failed',
      title: 'Google review sync failed',
      body: result.error ?? 'Could not sync Google reviews.',
      source: 'google_reviews',
      relatedUrl: '/admin/titan/website-intelligence',
      bypassQuietHours: true,
    });
  }

  return { ...result, message: formatMessage(result) };
}

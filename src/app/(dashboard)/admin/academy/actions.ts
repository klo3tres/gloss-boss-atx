'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import type { CmsAcademyArticle } from '@/components/admin/cms-academy-articles-client';

const KEY = 'business_academy_articles';

export async function saveAcademyArticlesAction(articles: CmsAcademyArticle[]): Promise<{ error?: string; ok?: boolean }> {
  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role)) return { error: 'Unauthorized' };
  const admin = tryCreateAdminSupabase();
  if (!admin) return { error: 'Database unavailable' };

  const { error } = await admin.from('site_settings').upsert(
    { key: KEY, value: articles, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) return { error: error.message };

  revalidatePath('/admin/academy');
  revalidatePath('/admin/cms');
  return { ok: true };
}

export async function loadAcademyArticlesFromCms(admin: ReturnType<typeof tryCreateAdminSupabase>) {
  if (!admin) return [];
  const { data } = await admin.from('site_settings').select('value').eq('key', KEY).maybeSingle();
  const raw = data?.value;
  if (!Array.isArray(raw)) return [];
  return raw.filter((row) => row && typeof row === 'object' && (row as CmsAcademyArticle).published !== false) as CmsAcademyArticle[];
}

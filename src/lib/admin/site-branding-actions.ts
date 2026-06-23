'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { upsertSiteSetting, upsertSiteSettingsBatch } from '@/lib/site-settings-upsert';

export async function saveNavbarLogoUrlAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await getSessionWithProfile();
  if (!session.user || (session.profile?.role !== 'super_admin' && session.profile?.role !== 'admin')) {
    return { ok: false, error: 'Unauthorized' };
  }

  const url = String(formData.get('navbar_logo_url') ?? '').trim();
  if (!url.startsWith('http') && !url.startsWith('/')) {
    return { ok: false, error: 'Enter a valid https URL or site-relative path.' };
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return { ok: false, error: 'Server admin client unavailable.' };
  }

  const now = new Date().toISOString();
  const result = await upsertSiteSetting(admin, { key: 'navbar_logo', value: url });
  if (!result.ok) {
    console.warn('[site_settings]', result.error);
    return { ok: false, error: result.error };
  }

  revalidatePath('/admin/cms');
  revalidatePath('/');
  return { ok: true };
}

export async function submitNavbarLogoForm(formData: FormData): Promise<void> {
  const r = await saveNavbarLogoUrlAction(formData);
  if (!r.ok) {
    redirect(`/admin/cms?logoErr=${encodeURIComponent(r.error ?? 'Save failed')}`);
  }
  redirect('/admin/cms?logoOk=1');
}

export async function saveHomepageLogoUrlAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await getSessionWithProfile();
  if (!session.user || (session.profile?.role !== 'super_admin' && session.profile?.role !== 'admin')) {
    return { ok: false, error: 'Unauthorized' };
  }

  const url = String(formData.get('homepage_logo_url') ?? '').trim();
  if (!url.startsWith('http') && !url.startsWith('/')) {
    return { ok: false, error: 'Enter a valid https URL or site-relative path.' };
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, error: 'Server admin client unavailable.' };

  const result = await upsertSiteSetting(admin, { key: 'homepage_logo', value: url });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/admin/cms');
  revalidatePath('/');
  return { ok: true };
}

export async function submitHomepageLogoForm(formData: FormData): Promise<void> {
  const r = await saveHomepageLogoUrlAction(formData);
  if (!r.ok) {
    redirect(`/admin/cms?homeLogoErr=${encodeURIComponent(r.error ?? 'Save failed')}`);
  }
  redirect('/admin/cms?homeLogoOk=1');
}

export async function submitSocialLinksForm(formData: FormData): Promise<void> {
  const session = await getSessionWithProfile();
  if (!session.user || (session.profile?.role !== 'super_admin' && session.profile?.role !== 'admin')) {
    redirect('/admin/cms?socialErr=Unauthorized');
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) redirect('/admin/cms?socialErr=Server%20admin%20client%20unavailable');

  const clean = (key: string) => {
    const value = String(formData.get(key) ?? '').trim();
    return value && !value.startsWith('http') ? '' : value;
  };
  const rows = [
    { key: 'social_instagram_url', value: clean('instagram_url') },
    { key: 'social_tiktok_url', value: clean('tiktok_url') },
    { key: 'social_youtube_url', value: clean('youtube_url') },
    { key: 'social_facebook_url', value: clean('facebook_url') },
  ];
  const result = await upsertSiteSettingsBatch(admin, rows);
  if (!result.ok) redirect(`/admin/cms?socialErr=${encodeURIComponent(result.error ?? 'Save failed')}`);

  revalidatePath('/admin/cms');
  revalidatePath('/');
  redirect('/admin/cms?socialOk=1');
}

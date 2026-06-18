'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

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
  const { error } = await admin.from('site_settings').upsert(
    { key: 'navbar_logo', value: url, updated_at: now },
    { onConflict: 'key' },
  );
  if (error) {
    console.warn('[site_settings]', error.message);
    return { ok: false, error: error.message };
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

  const now = new Date().toISOString();
  const { error } = await admin.from('site_settings').upsert(
    { key: 'homepage_logo', value: url, updated_at: now },
    { onConflict: 'key' },
  );
  if (error) return { ok: false, error: error.message };

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

  const now = new Date().toISOString();
  const clean = (key: string) => {
    const value = String(formData.get(key) ?? '').trim();
    return value && !value.startsWith('http') ? '' : value;
  };
  const rows = [
    { key: 'social_instagram_url', value: clean('instagram_url'), updated_at: now },
    { key: 'social_tiktok_url', value: clean('tiktok_url'), updated_at: now },
    { key: 'social_youtube_url', value: clean('youtube_url'), updated_at: now },
    { key: 'social_facebook_url', value: clean('facebook_url'), updated_at: now },
  ];
  const { error } = await admin.from('site_settings').upsert(rows, { onConflict: 'key' });
  if (error) redirect(`/admin/cms?socialErr=${encodeURIComponent(error.message)}`);

  revalidatePath('/admin/cms');
  revalidatePath('/');
  redirect('/admin/cms?socialOk=1');
}

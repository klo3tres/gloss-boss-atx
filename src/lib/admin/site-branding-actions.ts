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

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { MEDIA_REGISTRY_ITEMS } from '@/lib/media-registry';
import { upsertSiteSetting } from '@/lib/site-settings-upsert';

export async function saveMediaRegistryAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { error: 'Server admin client unavailable. Check SUPABASE_SERVICE_ROLE_KEY.' };

  const registry: Record<string, string> = {};
  for (const item of MEDIA_REGISTRY_ITEMS) {
    const value = String(formData.get(item.key) ?? '').trim();
    if (value) registry[item.key] = value;
  }

  const result = await upsertSiteSetting(admin, { key: 'media_registry', value: JSON.stringify(registry) });
  if (!result.ok) return { error: result.error ?? 'Publish failed' };

  revalidatePath('/');
  revalidatePath('/services');
  revalidatePath('/fleet');
  revalidatePath('/book');
  revalidatePath('/gift-cards');
  revalidatePath('/admin/cms');
  revalidatePath('/admin/media');
  return { ok: true };
}

/** Legacy form redirect wrapper */
export async function saveMediaRegistryFormAction(formData: FormData) {
  const r = await saveMediaRegistryAction(formData);
  if (!r.ok) redirect(`/admin/media?mediaErr=${encodeURIComponent(r.error ?? 'Publish failed')}`);
  redirect('/admin/media?mediaOk=1');
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { MEDIA_REGISTRY_ITEMS } from '@/lib/media-registry';

export async function saveMediaRegistryAction(formData: FormData) {
  const admin = tryCreateAdminSupabase();
  if (!admin) redirect('/admin/cms?tab=media&mediaErr=missing-service-role');

  const registry: Record<string, string> = {};
  for (const item of MEDIA_REGISTRY_ITEMS) {
    const value = String(formData.get(item.key) ?? '').trim();
    if (value) registry[item.key] = value;
  }

  const { error } = await admin
    .from('site_settings')
    .upsert({ key: 'media_registry', value: JSON.stringify(registry), updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) redirect(`/admin/cms?tab=media&mediaErr=${encodeURIComponent(error.message)}`);
  revalidatePath('/');
  revalidatePath('/services');
  revalidatePath('/fleet');
  revalidatePath('/book');
  revalidatePath('/gift-cards');
  revalidatePath('/admin/cms');
  redirect('/admin/cms?tab=media&mediaOk=1');
}

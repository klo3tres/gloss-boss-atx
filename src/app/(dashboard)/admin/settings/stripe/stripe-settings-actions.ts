'use server';

import { revalidatePath } from 'next/cache';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { saveStripeSettings } from '@/lib/stripe/stripeService';

export async function saveStripeSettingsAction(formData: FormData) {
  const session = await getSessionWithProfile();
  if (!session.supabaseConfigured || !session.user || !isAdminLevel(session.profile?.role ?? null)) {
    return { ok: false, error: 'Unauthorized' };
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return { ok: false, error: 'Database admin client unavailable' };
  }

  const secretKey = String(formData.get('secretKey') ?? '').trim();
  const webhookSecret = String(formData.get('webhookSecret') ?? '').trim();
  const publishableKey = String(formData.get('publishableKey') ?? '').trim();

  const partial: { secretKey?: string; webhookSecret?: string; publishableKey?: string } = {};
  if (secretKey.length > 0) partial.secretKey = secretKey;
  if (webhookSecret.length > 0) partial.webhookSecret = webhookSecret;
  if (publishableKey.length > 0) partial.publishableKey = publishableKey;

  if (Object.keys(partial).length === 0) {
    return { ok: false, error: 'Nothing to save — paste at least one key or use .env on Vercel.' };
  }

  const res = await saveStripeSettings(admin, partial);
  revalidatePath('/admin/settings/stripe');
  return res;
}

/** Form `action` must return void — use this wrapper; inspect server logs on failure. */
export async function submitStripeSettingsForm(formData: FormData): Promise<void> {
  const res = await saveStripeSettingsAction(formData);
  if (!res.ok) {
    console.warn('[Gloss Boss ATX][stripe settings]', res.error ?? 'save failed');
  }
}

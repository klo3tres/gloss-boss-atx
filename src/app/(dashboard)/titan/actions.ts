'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { createBusinessForUser, resolveBusinessContext } from '@/lib/titan/business-context';
import { createBusinessApiKey, listBusinessApiKeys, revokeBusinessApiKey } from '@/lib/titan/api-keys';

async function requireTitanSession() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !admin) return null;
  const ctx = await resolveBusinessContext(admin);
  if (!ctx) return null;
  return { session, admin, ctx };
}

export async function createBusinessOnboardingAction(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string; businessId?: string }> {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user?.id || !admin) return { error: 'Sign in required' };

  const name = String(formData.get('name') ?? '').trim();
  const slug = String(formData.get('slug') ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-');
  const industry = String(formData.get('industry') ?? 'other').trim();
  const websiteUrl = String(formData.get('website_url') ?? '').trim() || undefined;

  if (!name || !slug) return { error: 'Business name and slug are required' };

  const res = await createBusinessForUser(admin, {
    userId: session.user.id,
    name,
    slug,
    industry,
    websiteUrl,
  });

  if (!res.ok) return { error: res.error ?? 'Could not create business' };

  revalidatePath('/titan');
  return { ok: true, businessId: res.businessId };
}

export async function createApiKeyAction(): Promise<{ rawKey?: string; error?: string }> {
  const gate = await requireTitanSession();
  if (!gate) return { error: 'Unauthorized' };

  const res = await createBusinessApiKey(gate.admin, {
    businessId: gate.ctx.businessId,
    createdBy: gate.session.user!.id,
  });
  if (!res.ok) return { error: res.error };
  revalidatePath('/titan/api-keys');
  return { rawKey: res.rawKey };
}

export async function revokeApiKeyAction(keyId: string): Promise<void> {
  const gate = await requireTitanSession();
  if (!gate) return;
  await revokeBusinessApiKey(gate.admin, gate.ctx.businessId, keyId);
  revalidatePath('/titan/api-keys');
}

export async function loadTitanApiKeysForPage() {
  const gate = await requireTitanSession();
  if (!gate) return { keys: [], businessId: null };
  const keys = await listBusinessApiKeys(gate.admin, gate.ctx.businessId);
  return { keys, businessId: gate.ctx.businessId };
}

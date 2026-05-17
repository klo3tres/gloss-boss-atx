'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function requireAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return { ok: false as const, error: 'Forbidden' };
  return { ok: true as const, admin };
}

export async function savePromoCodeAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate.ok) return;
  const id = String(formData.get('id') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim().toUpperCase();
  if (!code) return;
  const isFree = code === 'FREE';
  const restrictions = String(formData.get('serviceRestrictions') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const row = {
    code,
    description: String(formData.get('description') ?? '').trim() || null,
    enabled: formData.get('enabled') === 'on',
    discount_type: isFree ? 'comp' : String(formData.get('discountType') ?? 'percent'),
    discount_value: isFree ? 100 : Number(formData.get('discountValue') ?? 0),
    service_restrictions: isFree && restrictions.length === 0 ? ['exterior-wash'] : restrictions,
    starts_at: String(formData.get('startsAt') ?? '').trim() || null,
    ends_at: String(formData.get('endsAt') ?? '').trim() || null,
    max_uses: String(formData.get('maxUses') ?? '').trim() ? Number(formData.get('maxUses')) : null,
    updated_at: new Date().toISOString(),
  };
  if (id) await gate.admin.from('promo_codes').update(row).eq('id', id);
  else {
    const existing = await gate.admin.from('promo_codes').select('id').eq('code', code).maybeSingle();
    if (existing.data?.id) await gate.admin.from('promo_codes').update(row).eq('id', existing.data.id);
    else await gate.admin.from('promo_codes').insert(row);
  }
  revalidatePath('/admin/promotions');
}

export async function setFreeTestPromoSettingAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate.ok) return;
  const enabled = formData.get('allowFreeTestPromo') === 'on';
  const now = new Date().toISOString();
  await gate.admin.from('site_settings').update({ allow_free_test_promo: enabled, updated_at: now }).neq('key', '__never__');
  await gate.admin
    .from('site_settings')
    .upsert({ key: 'allow_free_test_promo', value: enabled ? 'true' : 'false', updated_at: now }, { onConflict: 'key' });
  await gate.admin.from('promo_codes').upsert(
    {
      code: 'FREE',
      description: 'FREE test comp for Sedan Exterior Wash only.',
      enabled,
      discount_type: 'comp',
      discount_value: 100,
      service_restrictions: ['exterior-wash'],
      archived: false,
      archived_at: null,
      updated_at: now,
    },
    { onConflict: 'code' },
  );
  revalidatePath('/admin/promotions');
  revalidatePath('/book');
}

export async function archivePromoCodeAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate.ok) return;
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  await gate.admin
    .from('promo_codes')
    .update({ archived: true, archived_at: new Date().toISOString(), enabled: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  revalidatePath('/admin/promotions');
}

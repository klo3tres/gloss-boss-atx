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
  const row = {
    code,
    description: String(formData.get('description') ?? '').trim() || null,
    enabled: formData.get('enabled') === 'on',
    discount_type: String(formData.get('discountType') ?? 'percent'),
    discount_value: Number(formData.get('discountValue') ?? 0),
    service_restrictions: String(formData.get('serviceRestrictions') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    starts_at: String(formData.get('startsAt') ?? '').trim() || null,
    ends_at: String(formData.get('endsAt') ?? '').trim() || null,
    max_uses: String(formData.get('maxUses') ?? '').trim() ? Number(formData.get('maxUses')) : null,
    updated_at: new Date().toISOString(),
  };
  if (id) await gate.admin.from('promo_codes').update(row).eq('id', id);
  else await gate.admin.from('promo_codes').insert(row);
  revalidatePath('/admin/promotions');
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

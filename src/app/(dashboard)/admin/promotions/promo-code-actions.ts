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

function isPromoSchemaDrift(message?: string | null) {
  return /column|schema cache|Could not find|does not exist|discount_value|discount_type|enabled|archived_at|service_restrictions|max_uses|current_uses/i.test(
    message ?? '',
  );
}

function strippedPromoRows(row: Record<string, unknown>) {
  return [
    row,
    Object.fromEntries(
      Object.entries(row).filter(
        ([key]) => !['starts_at', 'ends_at', 'max_uses', 'service_restrictions', 'discount_value', 'discount_type', 'archived_at'].includes(key),
      ),
    ),
    Object.fromEntries(Object.entries(row).filter(([key]) => !['enabled', 'updated_at'].includes(key))),
    Object.fromEntries(Object.entries(row).filter(([key]) => ['code', 'description'].includes(key))),
  ];
}

async function updatePromoSafely(
  admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>,
  matcher: { id?: string; code?: string },
  row: Record<string, unknown>,
) {
  for (const patch of strippedPromoRows(row)) {
    let q = admin.from('promo_codes').update(patch);
    q = matcher.id ? q.eq('id', matcher.id) : q.eq('code', matcher.code ?? '');
    const { error } = await q;
    if (!error) return;
    if (!isPromoSchemaDrift(error.message)) {
      console.warn('[promotions] update failed', error.message);
      return;
    }
  }
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
  const rulesRaw = String(formData.get('rulesJson') ?? '').trim();
  let rules: Record<string, unknown> = {};
  if (rulesRaw) {
    try {
      rules = JSON.parse(rulesRaw) as Record<string, unknown>;
    } catch {
      console.warn('[promotions] invalid rules JSON ignored');
    }
  }
  if (formData.get('testModeOnly') === 'on') rules = { ...rules, testModeOnly: true };
  if (formData.get('stackable') === 'on') rules = { ...rules, stackable: true };
  if (isFree && !rules.appliesTo) rules = { ...rules, appliesTo: 'order' };
  const row = {
    code,
    description: String(formData.get('description') ?? '').trim() || null,
    enabled: formData.get('enabled') === 'on',
    discount_type: isFree ? 'comp' : String(formData.get('discountType') ?? 'percent'),
    discount_value: isFree ? 100 : Number(formData.get('discountValue') ?? 0),
    service_restrictions: isFree ? (restrictions.length > 0 ? restrictions : []) : restrictions,
    rules,
    starts_at: String(formData.get('startsAt') ?? '').trim() || null,
    ends_at: String(formData.get('endsAt') ?? '').trim() || null,
    max_uses: String(formData.get('maxUses') ?? '').trim() ? Number(formData.get('maxUses')) : null,
    updated_at: new Date().toISOString(),
  };
  if (id) await updatePromoSafely(gate.admin, { id }, row);
  else {
    const existing = await gate.admin.from('promo_codes').select('id').eq('code', code).maybeSingle();
    if (existing.data?.id) await updatePromoSafely(gate.admin, { id: existing.data.id }, row);
    else {
      let insert = await gate.admin.from('promo_codes').insert(row);
      if (insert.error && isPromoSchemaDrift(insert.error.message)) {
        insert = await gate.admin.from('promo_codes').insert({ code, description: row.description });
      }
      if (insert.error) console.warn('[promotions] insert failed', insert.error.message);
    }
  }
  revalidatePath('/admin/promotions');
}

/** @deprecated Use savePromoCodeAction on the FREE row — single control only. */
export async function setFreeTestPromoSettingAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate.ok) return;
  const enabled = formData.get('allowFreeTestPromo') === 'on';
  const fd = new FormData();
  fd.set('code', 'FREE');
  fd.set('enabled', enabled ? 'on' : 'off');
  fd.set('description', 'Owner test comp — full order $0');
  fd.set('discountType', 'comp');
  fd.set('discountValue', '100');
  fd.set('rulesJson', '{"appliesTo":"order"}');
  await savePromoCodeAction(fd);
}

export async function archivePromoCodeAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate.ok) return;
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  const full = await gate.admin
    .from('promo_codes')
    .update({ archived: true, archived_at: new Date().toISOString(), enabled: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (full.error && isPromoSchemaDrift(full.error.message)) {
    await gate.admin.from('promo_codes').update({ archived: true }).eq('id', id);
  } else if (full.error) {
    console.warn('[promotions] archive failed', full.error.message);
  }
  revalidatePath('/admin/promotions');
}

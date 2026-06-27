'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { saveTitanWorkspace, loadTitanWorkspace } from '@/lib/titan/workspace';

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) return null;
  return { admin };
}

function revalidate() {
  revalidatePath('/admin/setup-center');
  revalidatePath('/admin/titan');
  revalidatePath('/admin');
  revalidatePath('/admin/integrations');
}

export async function loadOwnerProfileSettingsAction() {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const ws = await loadTitanWorkspace(g.admin);
  return {
    ok: true,
    settings: {
      ownerDisplayName: ws.ownerDisplayName ?? '',
      ownerEmail: ws.ownerEmail ?? '',
      ownerPhone: ws.ownerPhone ?? '',
      businessName: ws.businessName,
      tablesReady: ws.tablesReady,
    },
  };
}

export async function saveOwnerProfileSettingsAction(input: {
  ownerDisplayName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  businessName?: string;
}) {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await saveTitanWorkspace(g.admin, {
    ownerDisplayName: input.ownerDisplayName?.trim() || null,
    ownerEmail: input.ownerEmail?.trim() || null,
    ownerPhone: input.ownerPhone?.trim() || null,
    businessName: input.businessName?.trim() || undefined,
  });
  if (!res.ok) return { error: res.error };
  revalidate();
  return { ok: true };
}

export async function sendTestOwnerEmailAction() {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const { sendTestOwnerEmail } = await import('@/lib/owner-lead-alerts');
  const res = await sendTestOwnerEmail(g.admin);
  if (!res.ok) return { error: res.error };
  return { ok: true };
}

export async function sendTestOwnerSmsAction() {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const { sendTestOwnerSms } = await import('@/lib/owner-lead-alerts');
  const res = await sendTestOwnerSms(g.admin);
  if (!res.ok) return { error: res.error ?? res.skipped };
  return { ok: true };
}

'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

function text(v: FormDataEntryValue | null) {
  return String(v ?? '').trim();
}

export async function updateSupplyRequestAction(formData: FormData) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return;

  const id = text(formData.get('id'));
  const status = text(formData.get('status')) || 'reviewed';
  const managerNote = text(formData.get('managerNote'));
  const existing = text(formData.get('existingNotes'));
  if (!id) return;

  const stamp = `[manager:${status}${managerNote ? ` - ${managerNote}` : ''}]`;
  const notes = existing.includes('[manager:')
    ? existing.replace(/\[manager:[^\]]+\]/g, stamp)
    : `${existing}${existing ? '\n' : ''}${stamp}`;

  await admin
    .from('business_expenses')
    .update({
      category: status === 'fulfilled' ? 'supply_fulfilled' : status === 'denied' ? 'supply_denied' : 'supply_request',
      notes,
    })
    .eq('id', id);

  revalidatePath('/admin/supply-requests');
  revalidatePath('/admin/operations');
}

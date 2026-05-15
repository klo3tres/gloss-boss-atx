'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function createLeadAction(formData: FormData) {
  const session = await getSessionWithProfile();
  if (!session.user) return { ok: false, error: 'Not signed in' };

  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, error: 'Server unavailable' };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Name required' };

  const { error } = await admin.from('leads').insert({
    name,
    phone: String(formData.get('phone') ?? '').trim() || null,
    email: String(formData.get('email') ?? '').trim() || null,
    address: String(formData.get('address') ?? '').trim() || null,
    vehicle: String(formData.get('vehicle') ?? '').trim() || null,
    notes: String(formData.get('notes') ?? '').trim() || null,
    lead_source: String(formData.get('lead_source') ?? 'field').trim() || 'field',
    status: 'new',
    in_pool: true,
    created_by: session.user.id,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath('/tech');
  revalidatePath('/admin/leads');
  return { ok: true };
}

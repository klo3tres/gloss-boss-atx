'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function updateFleetInquiryStatusAction(formData: FormData) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return;
  const id = String(formData.get('id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim() || 'contacted';
  if (!id) return;
  await admin.from('fleet_inquiries').update({ status }).eq('id', id);
  revalidatePath('/admin/fleet');
}

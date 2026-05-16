'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';

export async function addCustomerNoteAction(formData: FormData) {
  const customerId = String(formData.get('customerId') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  if (!customerId || !body) return;

  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  if (!session.supabaseConfigured || !supabase || !session.user || !isAdminLevel(session.profile?.role ?? null)) {
    return;
  }

  const { error } = await supabase.from('customer_notes').insert({
    customer_id: customerId,
    body,
    created_by: session.user.id,
  });
  if (error) console.error('[customer-note]', error.message);

  revalidatePath(`/admin/customers/${customerId}`);
}

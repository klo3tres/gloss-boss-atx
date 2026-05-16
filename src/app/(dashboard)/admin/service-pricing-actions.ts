'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function updateServicePriceCentsAction(formData: FormData) {
  const priceId = String(formData.get('priceId') ?? '').trim();
  const rawStr = String(formData.get('priceDollars') ?? '').trim();
  const raw = rawStr === '' ? 0 : Number(rawStr);
  if (!priceId || !Number.isFinite(raw) || raw < 0) return;

  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  if (!session.supabaseConfigured || !supabase || !session.user || !isAdminLevel(session.profile?.role ?? null)) {
    return;
  }

  const cents = Math.round(raw * 100);
  const admin = tryCreateAdminSupabase();
  const client = admin ?? supabase;
  const { error } = await client.from('service_prices').update({ price_cents: cents }).eq('id', priceId);
  if (error) console.error('[admin/services] price update', error.message);

  revalidatePath('/admin/services');
  revalidatePath('/admin/pricing');
  revalidatePath('/admin');
  revalidatePath('/book');
  revalidatePath('/services');
  revalidatePath('/');
  revalidatePath('/api/public/site-data');
  revalidatePath('/api/services');
}

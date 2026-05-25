'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function updateServicePriceCentsAction(formData: FormData) {
  const priceId = String(formData.get('priceId') ?? '').trim();
  const rawStr = String(formData.get('priceDollars') ?? '').trim();
  const raw = rawStr === '' ? 0 : Number(rawStr);
  if (!priceId || !Number.isFinite(raw) || raw < 0) redirect('/admin/services?priceErr=Invalid%20price');

  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  if (!session.supabaseConfigured || !supabase || !session.user || !isAdminLevel(session.profile?.role ?? null)) {
    redirect('/admin/services?priceErr=Unauthorized');
  }

  const cents = Math.round(raw * 100);
  const admin = tryCreateAdminSupabase();
  const client = admin ?? supabase;
  const { error } = await client.from('service_prices').update({ price_cents: cents }).eq('id', priceId);
  if (error) {
    console.error('[admin/services] price update', error.message);
    redirect(`/admin/services?priceErr=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/admin/services');
  revalidatePath('/admin/pricing');
  revalidatePath('/admin');
  revalidatePath('/book');
  revalidatePath('/services');
  revalidatePath('/');
  revalidatePath('/api/public/site-data');
  revalidatePath('/api/services');
  redirect('/admin/services?priceSaved=1');
}

export async function updateServiceActiveAction(formData: FormData) {
  const serviceId = String(formData.get('serviceId') ?? '').trim();
  const active = String(formData.get('active') ?? '') === 'true';
  if (!serviceId) redirect('/admin/services?priceErr=Missing%20service');

  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null)) {
    redirect('/admin/services?priceErr=Unauthorized');
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) redirect('/admin/services?priceErr=Database%20unavailable');

  const { error } = await admin.from('services').update({ active }).eq('id', serviceId);
  if (error) redirect(`/admin/services?priceErr=${encodeURIComponent(error.message)}`);

  revalidatePath('/admin/services');
  revalidatePath('/book');
  revalidatePath('/api/services');
  revalidatePath('/api/public/site-data');
  redirect('/admin/services?priceSaved=1');
}

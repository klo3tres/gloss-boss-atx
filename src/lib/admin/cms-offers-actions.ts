'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function upsertOfferAction(formData: FormData) {
  const session = await getSessionWithProfile();
  if (!session.user || !['admin', 'super_admin'].includes(session.profile?.role ?? '')) {
    redirect('/admin/cms?offerErr=' + encodeURIComponent('Admin access required'));
  }

  const id = String(formData.get('id') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim().slice(0, 120);
  const percentRaw = String(formData.get('percent_off') ?? '').trim();
  const active = formData.get('active') === 'on' || formData.get('active') === 'true';
  const percent = percentRaw ? Number(percentRaw) : 0;

  if (!label) {
    redirect('/admin/cms?offerErr=' + encodeURIComponent('Offer title required'));
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    redirect('/admin/cms?offerErr=' + encodeURIComponent('Service role unavailable'));
  }

  try {
    if (id) {
      const payloads = [
        { label, percent_off: percent, discount_percent: percent, active, title: label },
        { label, percent_off: percent, active },
        { title: label, discount_percent: percent, active },
      ];
      let lastErr: string | null = null;
      for (const p of payloads) {
        const { error } = await admin.from('offers').update(p).eq('id', id);
        if (!error) {
          revalidatePath('/admin/cms');
          revalidatePath('/services');
          revalidatePath('/');
          redirect('/admin/cms?offerOk=1');
        }
        lastErr = error.message;
      }
      redirect('/admin/cms?offerErr=' + encodeURIComponent(lastErr ?? 'Update failed'));
    }

    const maxQ = await admin.from('offers').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const sort_order =
      !maxQ.error && maxQ.data?.[0] && typeof (maxQ.data[0] as { sort_order?: number }).sort_order === 'number'
        ? Number((maxQ.data[0] as { sort_order: number }).sort_order) + 10
        : 10;

    const inserts = [
      { label, title: label, percent_off: percent, discount_percent: percent, active, sort_order },
      { label, percent_off: percent, active, sort_order },
    ];
    for (const p of inserts) {
      const { error } = await admin.from('offers').insert(p);
      if (!error) {
        revalidatePath('/admin/cms');
        revalidatePath('/services');
        revalidatePath('/');
        redirect('/admin/cms?offerOk=1');
      }
    }
    redirect('/admin/cms?offerErr=' + encodeURIComponent('Could not create offer'));
  } catch (e) {
    redirect('/admin/cms?offerErr=' + encodeURIComponent(e instanceof Error ? e.message : 'Offer save failed'));
  }
}

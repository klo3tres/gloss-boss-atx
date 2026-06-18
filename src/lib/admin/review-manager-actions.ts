'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function rating(v: unknown) {
  const n = Number(v);
  return Math.max(1, Math.min(5, Number.isFinite(n) ? Math.round(n) : 5));
}

function done(params = 'reviewOk=1'): never {
  revalidatePath('/');
  revalidatePath('/admin/cms');
  redirect(`/admin/cms?tab=reviews&${params}`);
}

export async function saveManualReviewAction(formData: FormData) {
  const admin = tryCreateAdminSupabase();
  if (!admin) redirect('/admin/cms?tab=reviews&reviewErr=missing-service-role');
  const id = str(formData.get('id'));
  const now = new Date().toISOString();
  const row = {
    customer_name: str(formData.get('customer_name')) || 'Gloss Boss customer',
    rating: rating(formData.get('rating')),
    testimonial: str(formData.get('testimonial')),
    service_label: str(formData.get('service_label')),
    vehicle_label: str(formData.get('vehicle_label')),
    source: str(formData.get('source')) || 'Manual',
    published: formData.get('published') === 'on',
    featured: formData.get('featured') === 'on',
    approved_at: formData.get('published') === 'on' ? now : null,
  };
  if (!row.testimonial) redirect('/admin/cms?tab=reviews&reviewErr=review-text-required');
  const res = id
    ? await admin.from('customer_reviews').update(row).eq('id', id)
    : await admin.from('customer_reviews').insert(row);
  if (res.error) redirect(`/admin/cms?tab=reviews&reviewErr=${encodeURIComponent(res.error.message)}`);
  done();
}

export async function deleteManualReviewAction(formData: FormData) {
  const admin = tryCreateAdminSupabase();
  if (!admin) redirect('/admin/cms?tab=reviews&reviewErr=missing-service-role');
  const id = str(formData.get('id'));
  if (!id) redirect('/admin/cms?tab=reviews&reviewErr=missing-review');
  const { error } = await admin.from('customer_reviews').delete().eq('id', id);
  if (error) redirect(`/admin/cms?tab=reviews&reviewErr=${encodeURIComponent(error.message)}`);
  done('reviewDeleted=1');
}

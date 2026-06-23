'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) return null;
  return { admin };
}

export async function createManualReviewAction(input: {
  customerName: string;
  rating: number;
  testimonial: string;
  source?: string;
  serviceLabel?: string;
  published?: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };

  const { error } = await g.admin.from('customer_reviews').insert({
    customer_name: input.customerName.trim(),
    rating: Math.max(1, Math.min(5, input.rating)),
    testimonial: input.testimonial.trim(),
    review_text: input.testimonial.trim(),
    source: input.source?.trim() || 'manual',
    service_label: input.serviceLabel?.trim() || null,
    published: input.published ?? true,
    approved_at: new Date().toISOString(),
  });

  if (error) return { error: error.message };
  revalidatePath('/');
  revalidatePath('/admin/reviews');
  return { ok: true };
}

export async function toggleReviewPublishedAction(id: string, published: boolean): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const { error } = await g.admin.from('customer_reviews').update({ published }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/');
  revalidatePath('/admin/reviews');
  return { ok: true };
}

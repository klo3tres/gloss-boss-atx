'use server';

import { revalidatePath } from 'next/cache';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export type ReviewActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function rating(v: unknown) {
  const n = Number(v);
  return Math.max(1, Math.min(5, Number.isFinite(n) ? Math.round(n) : 5));
}

function dateIso(v: unknown) {
  const raw = str(v);
  if (!raw) return new Date().toISOString();
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function revalidateReviews() {
  revalidatePath('/');
  revalidatePath('/admin/cms');
  revalidatePath('/api/public/site-data');
}

function isSchemaFallbackError(message: string) {
  return /column .* does not exist|schema cache|Could not find|review_text|vehicle_label|source|featured|updated_at/i.test(message);
}

async function writeReview(admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>, id: string, row: Record<string, unknown>) {
  const query = id ? admin.from('customer_reviews').update(row).eq('id', id) : admin.from('customer_reviews').insert(row);
  const res = await query;
  if (!res.error || !isSchemaFallbackError(res.error.message)) return res;

  const fallback = {
    customer_name: row.customer_name,
    rating: row.rating,
    testimonial: row.testimonial,
    service_label: row.service_label,
    published: row.published,
    approved_at: row.approved_at,
    created_at: row.created_at,
  };
  return id
    ? await admin.from('customer_reviews').update(fallback).eq('id', id)
    : await admin.from('customer_reviews').insert(fallback);
}

export async function saveManualReviewAction(formData: FormData): Promise<ReviewActionResult> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, error: 'Admin database client unavailable. Check the service role key.' };

  const testimonial = str(formData.get('testimonial'));
  if (!testimonial) return { ok: false, error: 'Review text is required.' };

  const id = str(formData.get('id'));
  const published = formData.get('published') === 'on' || formData.get('published') === 'true';
  const createdAt = dateIso(formData.get('review_date'));
  const now = new Date().toISOString();
  const row = {
    customer_name: str(formData.get('customer_name')) || 'Gloss Boss customer',
    rating: rating(formData.get('rating')),
    testimonial,
    review_text: testimonial,
    service_label: str(formData.get('service_label')),
    vehicle_label: str(formData.get('vehicle_label')),
    source: str(formData.get('source')) || 'Manual',
    published,
    featured: formData.get('featured') === 'on' || formData.get('featured') === 'true',
    approved_at: published ? now : null,
    created_at: createdAt,
    updated_at: now,
  };

  const res = await writeReview(admin, id, row);
  if (res.error) return { ok: false, error: res.error.message };

  revalidateReviews();
  return { ok: true, message: id ? 'Review updated.' : 'Review added.' };
}

export async function deleteManualReviewAction(formData: FormData): Promise<ReviewActionResult> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, error: 'Admin database client unavailable. Check the service role key.' };
  const id = str(formData.get('id'));
  if (!id) return { ok: false, error: 'Missing review id.' };
  const { error } = await admin.from('customer_reviews').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidateReviews();
  return { ok: true, message: 'Review deleted.' };
}

'use server';

import { revalidatePath } from 'next/cache';
import { isAdminLevel } from '@/lib/auth/roles';
import { getSessionWithProfile } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  dbAddGalleryImageFromUrl,
  dbDeleteGalleryImage,
  dbReorderGalleryBulk,
  dbReorderGalleryStep,
  dbSaveFeaturedShowcase,
  dbToggleGalleryFeatured,
  dbToggleGalleryPublished,
} from '@/lib/admin/gallery-db-mutations';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function requireAdminSupabase() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  if (!session.supabaseConfigured || !supabase || !session.user || !isAdminLevel(session.profile?.role ?? null)) {
    return { ok: false as const, supabase: null };
  }
  return { ok: true as const, supabase };
}

export async function setMessageStatusAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  if (!id || !['new', 'read', 'replied', 'archived'].includes(status)) return;

  const gate = await requireAdminSupabase();
  if (!gate.ok) return;

  await gate.supabase.from('messages').update({ status }).eq('id', id);
  revalidatePath('/admin/messages');
}

export async function deleteGalleryImageAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  const gate = await requireAdminSupabase();
  if (!gate.ok) return;
  await dbDeleteGalleryImage(gate.supabase, id);
  revalidatePath('/admin/cms');
  revalidatePath('/');
  revalidatePath('/gallery');
  revalidatePath('/book');
}

export async function toggleGalleryFeaturedAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  const featured = formData.get('featured') === 'true';
  if (!id) return;
  const gate = await requireAdminSupabase();
  if (!gate.ok) return;
  await dbToggleGalleryFeatured(gate.supabase, id, featured);
  revalidatePath('/admin/cms');
  revalidatePath('/');
  revalidatePath('/gallery');
}

export async function toggleGalleryPublishedAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  const published = formData.get('published') === 'true';
  if (!id) return;
  const gate = await requireAdminSupabase();
  if (!gate.ok) return;
  await dbToggleGalleryPublished(gate.supabase, id, published);
  revalidatePath('/admin/cms');
  revalidatePath('/');
  revalidatePath('/gallery');
}

export async function reorderGalleryImageAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  const direction = String(formData.get('direction') ?? '').trim();
  if (!id || (direction !== 'up' && direction !== 'down')) return;

  const gate = await requireAdminSupabase();
  if (!gate.ok) return;

  await dbReorderGalleryStep(gate.supabase, id, direction);
  revalidatePath('/admin/cms');
  revalidatePath('/');
  revalidatePath('/gallery');
}

export async function reorderGalleryBulkAction(formData: FormData) {
  const orderRaw = String(formData.get('order') ?? '').trim();
  if (!orderRaw) return;

  const ids = orderRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return;

  const gate = await requireAdminSupabase();
  if (!gate.ok) return;

  await dbReorderGalleryBulk(gate.supabase, ids);
  revalidatePath('/admin/cms');
  revalidatePath('/');
  revalidatePath('/gallery');
}

export async function addGalleryImageAction(formData: FormData) {
  const imageUrl = String(formData.get('image_url') ?? '').trim();
  const caption = String(formData.get('caption') ?? '').trim();
  if (!imageUrl) return;
  const gate = await requireAdminSupabase();
  if (!gate.ok) return;

  const r = await dbAddGalleryImageFromUrl(gate.supabase, imageUrl, caption);
  if (r.ok) {
    revalidatePath('/admin/cms');
    revalidatePath('/');
    revalidatePath('/gallery');
  } else {
    console.warn('[CRM_DEBUG_DB]', 'gallery_images_insert_all_variants_failed', imageUrl, r.error);
  }
}

export async function saveFeaturedShowcaseAction(formData: FormData) {
  const raw = String(formData.get('json') ?? '').trim();
  if (!raw) return;
  const gate = await requireAdminSupabase();
  if (!gate.ok) return;
  const r = await dbSaveFeaturedShowcase(tryCreateAdminSupabase() ?? gate.supabase, raw);
  if (!r.ok) {
    console.warn('[CRM_DEBUG_DB]', 'featured_showcase_save', r.error);
    return;
  }
  revalidatePath('/');
  revalidatePath('/admin/cms');
  revalidatePath('/services');
  revalidatePath('/gallery');
}

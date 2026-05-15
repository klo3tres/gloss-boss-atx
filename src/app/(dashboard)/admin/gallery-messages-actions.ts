'use server';

import { revalidatePath } from 'next/cache';
import { isAdminLevel } from '@/lib/auth/roles';
import { getSessionWithProfile } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { extractGallerySortRow, galleryInsertPayloadVariants, maxGallerySortFromRows } from '@/lib/gallery-normalize';

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
  await gate.supabase.from('gallery_images').delete().eq('id', id);
  revalidatePath('/admin/cms');
  revalidatePath('/');
  revalidatePath('/gallery');
  revalidatePath('/book');
}

export async function reorderGalleryImageAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  const direction = String(formData.get('direction') ?? '').trim();
  if (!id || (direction !== 'up' && direction !== 'down')) return;

  const gate = await requireAdminSupabase();
  if (!gate.ok) return;

  let r1 = await gate.supabase.from('gallery_images').select('*').order('sort_order', { ascending: true });
  if (r1.error && /sort_order|column .* does not exist|Could not find|schema cache/i.test(r1.error.message)) {
    r1 = await gate.supabase.from('gallery_images').select('*').order('order_index', { ascending: true, nullsFirst: false });
  }
  if (r1.error && /order_index|column .* does not exist|Could not find|schema cache/i.test(r1.error.message)) {
    r1 = await gate.supabase.from('gallery_images').select('*');
  }

  if (r1.error || !r1.data?.length) {
    console.warn('[CRM_DEBUG_DB]', 'gallery_reorder_list_failed', r1.error?.message);
    return;
  }

  type Row = { id: string; sort_order: number; order_index: number | null };

  const list: Row[] = (r1.data as Record<string, unknown>[])
    .map((row) => extractGallerySortRow(row))
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const j = direction === 'up' ? idx - 1 : idx + 1;
  if (j < 0 || j >= list.length) return;

  const a = list[idx];
  const b = list[j];
  const sortA = a.order_index ?? a.sort_order;
  const sortB = b.order_index ?? b.sort_order;

  const upA = await gate.supabase.from('gallery_images').update({ order_index: sortB, sort_order: sortB }).eq('id', a.id);
  const upB = await gate.supabase.from('gallery_images').update({ order_index: sortA, sort_order: sortA }).eq('id', b.id);
  if (upA.error || upB.error) {
    await gate.supabase.from('gallery_images').update({ sort_order: sortB }).eq('id', a.id);
    await gate.supabase.from('gallery_images').update({ sort_order: sortA }).eq('id', b.id);
  }

  revalidatePath('/admin/cms');
  revalidatePath('/');
  revalidatePath('/gallery');
}

/** Apply drag-reorder: comma-separated gallery image ids in display order. */
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

  let i = 0;
  for (const id of ids) {
    i += 10;
    try {
      const { error } = await gate.supabase
        .from('gallery_images')
        .update({ sort_order: i, order_index: i })
        .eq('id', id);
      if (error) {
        await gate.supabase.from('gallery_images').update({ sort_order: i }).eq('id', id);
      }
    } catch (e) {
      console.warn('[gallery] bulk reorder', id, e);
    }
  }

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

  const maxQ = await gate.supabase.from('gallery_images').select('*').limit(500);
  if (maxQ.error) {
    console.warn('[CRM_DEBUG_DB]', 'gallery_max_sort', maxQ.error.message);
    return;
  }
  const nextOrder = maxGallerySortFromRows(maxQ.data ?? []) + 1;

  const variants = galleryInsertPayloadVariants(imageUrl, caption, nextOrder);
  for (const row of variants) {
    const { error: insErr } = await gate.supabase.from('gallery_images').insert(row);
    if (!insErr) {
      revalidatePath('/admin/cms');
      revalidatePath('/');
      revalidatePath('/gallery');
      return;
    }
  }
  console.warn('[CRM_DEBUG_DB]', 'gallery_images_insert_all_variants_failed', imageUrl);
}

export async function saveFeaturedShowcaseAction(formData: FormData) {
  const raw = String(formData.get('json') ?? '').trim();
  if (!raw) return;
  const gate = await requireAdminSupabase();
  if (!gate.ok) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    console.warn('[CRM_DEBUG_DB]', 'featured_showcase_json_invalid');
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;
  const slides = (parsed as { slides?: unknown }).slides;
  if (!Array.isArray(slides)) return;

  const value = { slides: slides.slice(0, 12) };
  const { data: existing, error: selErr } = await gate.supabase.from('homepage_content').select('id').eq('key', 'featured_showcase').maybeSingle();
  if (selErr) {
    console.warn('[CRM_DEBUG_DB]', 'featured_showcase_select', selErr.message);
    return;
  }
  if (existing?.id) {
    const { error: upErr } = await gate.supabase.from('homepage_content').update({ value, updated_at: new Date().toISOString() }).eq('id', existing.id);
    if (upErr) console.warn('[CRM_DEBUG_DB]', 'featured_showcase_update', upErr.message);
  } else {
    const { error: insErr } = await gate.supabase.from('homepage_content').insert({ key: 'featured_showcase', value });
    if (insErr) console.warn('[CRM_DEBUG_DB]', 'featured_showcase_insert', insErr.message);
  }
  revalidatePath('/');
  revalidatePath('/admin/cms');
  revalidatePath('/services');
}

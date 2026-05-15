'use server';

import { revalidatePath } from 'next/cache';
import { isAdminLevel } from '@/lib/auth/roles';
import { getSessionWithProfile } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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

  const { data: rows, error } = await gate.supabase
    .from('gallery_images')
    .select('id, sort_order, order_index')
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true });

  if (error || !rows?.length) {
    console.warn('[CRM_DEBUG_DB]', 'gallery_reorder_list_failed', error?.message);
    return;
  }

  type Row = { id: string; sort_order: number; order_index: number | null };
  const list = rows as Row[];
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const j = direction === 'up' ? idx - 1 : idx + 1;
  if (j < 0 || j >= list.length) return;

  const a = list[idx];
  const b = list[j];
  const sortA = a.order_index ?? a.sort_order;
  const sortB = b.order_index ?? b.sort_order;

  await gate.supabase.from('gallery_images').update({ order_index: sortB, sort_order: sortB }).eq('id', a.id);
  await gate.supabase.from('gallery_images').update({ order_index: sortA, sort_order: sortA }).eq('id', b.id);

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

  const { data: maxRow } = await gate.supabase
    .from('gallery_images')
    .select('sort_order, order_index')
    .order('order_index', { ascending: false, nullsFirst: false })
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = Math.max(maxRow?.order_index ?? 0, maxRow?.sort_order ?? 0) + 1;

  await gate.supabase.from('gallery_images').insert({
    image_url: imageUrl,
    url: imageUrl,
    caption: caption || null,
    sort_order: nextOrder,
    order_index: nextOrder,
    published: true,
  });
  revalidatePath('/admin/cms');
  revalidatePath('/');
  revalidatePath('/gallery');
}

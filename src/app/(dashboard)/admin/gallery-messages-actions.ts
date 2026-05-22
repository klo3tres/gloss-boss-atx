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

  const admin = tryCreateAdminSupabase();
  const client = admin ?? gate.supabase;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === 'read') patch.read_at = now;
  if (status === 'replied') patch.replied_at = now;
  if (status === 'archived') patch.archived_at = now;
  if (status === 'new') {
    patch.read_at = null;
    patch.replied_at = null;
    patch.archived_at = null;
  }

  let { error } = await client.from('messages').update(patch).eq('id', id);
  if (error && /read_at|replied_at|archived_at|column|schema cache|Could not find/i.test(error.message)) {
    ({ error } = await client.from('messages').update({ status }).eq('id', id));
  }
  if (error) console.error('[setMessageStatusAction]', error.message);
  revalidatePath('/admin/messages');
}

export async function replyToMessageAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  const reply = String(formData.get('reply') ?? '').trim();
  if (!id || !reply) return;
  const gate = await requireAdminSupabase();
  if (!gate.ok) return;
  const admin = tryCreateAdminSupabase();
  const client = admin ?? gate.supabase;
  const now = new Date().toISOString();
  const { data: message } = await client.from('messages').select('*').eq('id', id).maybeSingle();
  const row = (message ?? {}) as Record<string, unknown>;
  let { error } = await client
    .from('messages')
    .update({ status: 'replied', admin_reply: reply, reply_body: reply, replied_at: now, read_at: now })
    .eq('id', id);
  if (error && /reply_body|admin_reply|replied_at|read_at|replied_by|column|schema cache|Could not find/i.test(error.message)) {
    ({ error } = await client.from('messages').update({ status: 'replied', admin_reply: reply, replied_at: now }).eq('id', id));
  }
  if (error && /column|schema cache|Could not find/i.test(error.message)) {
    ({ error } = await client.from('messages').update({ status: 'replied' }).eq('id', id));
  }
  await client.from('notification_outbox').insert({
    channel: 'email',
    kind: 'message_reply',
    status: process.env.RESEND_API_KEY ? 'pending' : 'skipped',
    skipped_reason: process.env.RESEND_API_KEY ? null : 'Skipped - configure Twilio/Resend.',
    payload: {
      message_id: id,
      to: row.from_email ?? null,
      subject: row.subject ? `Re: ${row.subject}` : 'Re: Gloss Boss ATX message',
      body: reply,
    },
  });
  if (error) console.error('[replyToMessageAction]', error.message);
  revalidatePath('/admin/messages');
  revalidatePath('/dashboard/messages');
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

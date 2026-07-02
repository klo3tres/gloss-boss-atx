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
import { resendConfigured, sendResendHtml } from '@/lib/email-send';
import { glossBossEmailLayout, emailParagraph } from '@/lib/email/templates/layout';
import { emitOwnerNotification } from '@/lib/titan/owner-notification-router';

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
  if (!id || !['new', 'read', 'replied', 'archived', 'deleted'].includes(status)) return;

  const gate = await requireAdminSupabase();
  if (!gate.ok) return;

  const admin = tryCreateAdminSupabase();
  const client = admin ?? gate.supabase;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === 'read') patch.read_at = now;
  if (status === 'replied') patch.replied_at = now;
  if (status === 'archived') patch.archived_at = now;
  if (status === 'deleted') {
    patch.archived_at = now;
    patch.deleted_at = now;
  }
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
  const toEmail = String(row.from_email ?? '').trim().toLowerCase();
  let emailStatus: string = 'skipped';
  let emailError: string | null = null;
  if (!toEmail.includes('@')) {
    emailError = 'Customer email missing — reply saved in portal only.';
  } else if (!resendConfigured()) {
    emailError = 'Resend not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.';
  } else {
    const html = glossBossEmailLayout({
      title: 'Reply from Gloss Boss ATX',
      headline: 'Message from Gloss Boss ATX',
      bodyHtml: emailParagraph(reply, true),
    });
    const sent = await sendResendHtml({
      to: toEmail,
      subject: row.subject ? `Re: ${String(row.subject)}` : 'Re: Your message to Gloss Boss ATX',
      html,
    });
    if (sent.ok) emailStatus = 'sent';
    else {
      emailStatus = 'failed';
      emailError = sent.error ?? 'Resend send failed.';
    }
  }

  await client.from('notification_outbox').insert({
    channel: 'email',
    kind: 'message_reply',
    status: emailStatus,
    skipped_reason: emailStatus === 'skipped' ? emailError : null,
    error_message: emailStatus === 'failed' ? emailError : null,
    payload: {
      message_id: id,
      to: toEmail || null,
      subject: row.subject ? `Re: ${row.subject}` : 'Re: Gloss Boss ATX message',
      body: reply,
      resend_status: emailStatus,
    },
  });
  if (admin) {
    const customerName = String(row.from_name ?? row.name ?? 'Customer').trim();
    void emitOwnerNotification(admin, {
      eventType: 'customer_replied',
      title: `Reply sent to ${customerName}`,
      body: `Your reply to ${customerName}${toEmail ? ` <${toEmail}>` : ''} was saved${emailStatus === 'sent' ? ' and emailed' : ''}.`,
      source: 'message_center',
      relatedType: 'message',
      relatedId: id,
      relatedUrl: `${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '')}/admin/messages`,
      emailStatus: 'skipped',
      smsStatus: 'skipped',
    });
  }
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

export async function saveHomepageVisualsAction(formData: FormData) {
  const raw = String(formData.get('json') ?? '').trim();
  if (!raw) return;
  const gate = await requireAdminSupabase();
  if (!gate.ok) return;
  const admin = tryCreateAdminSupabase();
  const client = admin ?? gate.supabase;
  let { error } = await client.from('site_settings').upsert(
    {
      key: 'homepage_visuals',
      value: raw,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
  if (error && /updated_at|column|schema cache|Could not find/i.test(error.message)) {
    ({ error } = await client.from('site_settings').upsert(
      {
        key: 'homepage_visuals',
        value: raw,
      },
      { onConflict: 'key' },
    ));
  }
  if (error) {
    console.warn('[CRM_DEBUG_DB]', 'homepage_visuals_save', error.message);
    return;
  }
  revalidatePath('/');
  revalidatePath('/admin/cms');
  revalidatePath('/services');
  revalidatePath('/gallery');
}

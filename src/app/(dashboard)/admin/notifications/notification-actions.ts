'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function requireAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return null;
  return admin;
}

export async function saveNotificationTemplateAction(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const id = String(formData.get('id') ?? '').trim();
  const key = String(formData.get('key') ?? '').trim();
  const channel = String(formData.get('channel') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const subject = String(formData.get('subject') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const enabled = String(formData.get('enabled') ?? '') === 'on';
  if (!key || !channel || !name || !body) return;

  const row = {
    template_key: key,
    channel,
    name,
    subject: subject || null,
    body,
    enabled,
    variables: ['customer', 'vehicle', 'service', 'tech', 'address', 'appointment_time', 'payment_link', 'review_link'],
    updated_at: new Date().toISOString(),
  };
  if (id) {
    await admin.from('notification_templates').update(row).eq('id', id);
  } else {
    await admin.from('notification_templates').insert(row);
  }
  revalidatePath('/admin/notifications');
}

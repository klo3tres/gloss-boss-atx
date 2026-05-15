'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

const CATEGORIES = new Set(['liability', 'sop', 'homepage_banner', 'other']);

export async function saveCmsDocumentUrlAction(formData: FormData) {
  const session = await getSessionWithProfile();
  if (!session.user || !['admin', 'super_admin'].includes(session.profile?.role ?? '')) {
    redirect('/admin/cms?docErr=' + encodeURIComponent('Admin access required'));
  }

  const category = String(formData.get('category') ?? 'other').trim();
  const title = String(formData.get('title') ?? '').trim().slice(0, 200);
  const fileUrl = String(formData.get('file_url') ?? '').trim();
  if (!CATEGORIES.has(category) || !fileUrl) {
    redirect('/admin/cms?docErr=' + encodeURIComponent('Category and file URL required'));
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    redirect('/admin/cms?docErr=' + encodeURIComponent('Service role unavailable'));
  }

  try {
    const maxQ = await admin.from('cms_documents').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const nextOrder =
      !maxQ.error && maxQ.data?.[0] && typeof (maxQ.data[0] as { sort_order?: number }).sort_order === 'number'
        ? Number((maxQ.data[0] as { sort_order: number }).sort_order) + 10
        : 10;

    const { error } = await admin.from('cms_documents').insert({
      category,
      title: title || category,
      file_url: fileUrl,
      mime_type: fileUrl.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/html',
      sort_order: nextOrder,
    });

    if (error) {
      redirect('/admin/cms?docErr=' + encodeURIComponent(error.message));
    }
  } catch (e) {
    redirect('/admin/cms?docErr=' + encodeURIComponent(e instanceof Error ? e.message : 'Save failed'));
  }

  revalidatePath('/admin/cms');
  redirect('/admin/cms?docOk=1');
}

export async function deleteCmsDocumentAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  const session = await getSessionWithProfile();
  if (!session.user || !['admin', 'super_admin'].includes(session.profile?.role ?? '')) return;

  const admin = tryCreateAdminSupabase();
  if (!admin) return;

  try {
    await admin.from('cms_documents').delete().eq('id', id);
  } catch (e) {
    console.warn('[cms_documents] delete', e);
  }

  revalidatePath('/admin/cms');
}

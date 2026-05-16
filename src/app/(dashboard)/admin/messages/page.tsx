import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { mapMessageRow, MESSAGE_SELECT_FALLBACK, MESSAGE_SELECT_LEAN, MESSAGE_SELECT_WITH_PHONE, type MessageRow } from '@/lib/messages-map';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { MessagesCenterClient } from '@/components/admin/messages-center-client';

export const dynamic = 'force-dynamic';

export default async function AdminMessagesPage() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();

  let rows: MessageRow[] = [];
  let messagesError: string | null = null;

  if (supabase && session.user && isAdminLevel(session.profile?.role ?? null)) {
    const db = tryCreateAdminSupabase() ?? supabase;
    const qStar = await db.from('messages').select('*').order('created_at', { ascending: false }).limit(100);
    let data: unknown[] | null = qStar.data as unknown[] | null;
    let err = qStar.error;
    if (err) {
      const qPhone = await db.from('messages').select(MESSAGE_SELECT_WITH_PHONE).order('created_at', { ascending: false }).limit(100);
      data = qPhone.data as unknown[] | null;
      err = qPhone.error;
    }
    if (err && /from_phone|column|schema cache|Could not find/i.test(err.message)) {
      const qLean = await db.from('messages').select(MESSAGE_SELECT_LEAN).order('created_at', { ascending: false }).limit(100);
      data = qLean.data as unknown[] | null;
      err = qLean.error;
    }
    if (err && /from_name|\bname\b|column|schema cache|Could not find/i.test(err.message)) {
      const qFb = await db.from('messages').select(MESSAGE_SELECT_FALLBACK).order('created_at', { ascending: false }).limit(100);
      data = qFb.data as unknown[] | null;
      err = qFb.error;
    }
    if (err) {
      if (/Could not find|schema cache|relation.*messages/i.test(err.message)) {
        messagesError = 'Messages table not found — run migrations in Supabase.';
      } else {
        messagesError = err.message;
      }
    } else {
      rows = (data ?? [])
        .map((r) => mapMessageRow(r as Record<string, unknown>))
        .filter((x): x is MessageRow => x != null);
    }
  }

  return (
    <DashboardShell title='Message center' subtitle='Contact form submissions — premium inbox view.' role='admin'>
      {messagesError ? (
        <p className='mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>
          {messagesError}
        </p>
      ) : null}
      {rows.length === 0 && !messagesError ? (
        <p className='rounded-2xl border border-white/10 bg-zinc-950 p-6 text-sm text-zinc-400'>No messages yet.</p>
      ) : rows.length > 0 ? (
        <MessagesCenterClient rows={rows} />
      ) : null}
    </DashboardShell>
  );
}

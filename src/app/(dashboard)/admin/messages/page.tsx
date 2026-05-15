import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { setMessageStatusAction } from '@/app/(dashboard)/admin/gallery-messages-actions';
import { mapMessageRow, MESSAGE_SELECT_FALLBACK, MESSAGE_SELECT_LEAN, type MessageRow } from '@/lib/messages-map';

export const dynamic = 'force-dynamic';

export default async function AdminMessagesPage() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();

  let rows: MessageRow[] = [];
  let messagesError: string | null = null;

  if (supabase && session.user && isAdminLevel(session.profile?.role ?? null)) {
    const full = await supabase.from('messages').select(MESSAGE_SELECT_LEAN).order('created_at', { ascending: false }).limit(100);
    if (full.error && /from_name|column|schema cache|Could not find/i.test(full.error.message)) {
      const lean = await supabase.from('messages').select(MESSAGE_SELECT_FALLBACK).order('created_at', { ascending: false }).limit(100);
      if (lean.error) {
        if (/Could not find|schema cache|relation.*messages/i.test(lean.error.message)) {
          messagesError = 'Messages table not found — run migrations in Supabase.';
        } else {
          messagesError = lean.error.message;
        }
      } else {
        rows = (lean.data ?? [])
          .map((r) => mapMessageRow(r as Record<string, unknown>))
          .filter((x): x is MessageRow => x != null);
      }
    } else if (full.error) {
      messagesError = full.error.message;
    } else {
      rows = (full.data ?? [])
        .map((r) => mapMessageRow(r as Record<string, unknown>))
        .filter((x): x is MessageRow => x != null);
    }
  }

  return (
    <DashboardShell title='Message center' subtitle='Contact form submissions from the homepage.' role='admin'>
      {messagesError ? (
        <p className='mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>
          {messagesError}
        </p>
      ) : null}
      {rows.length === 0 && !messagesError ? (
        <p className='rounded-2xl border border-white/10 bg-zinc-950 p-6 text-sm text-zinc-400'>No messages yet.</p>
      ) : (
        <ul className='space-y-4'>
          {rows.map((m) => (
            <li key={m.id} className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                  <p className='text-xs text-zinc-500'>{new Date(m.created_at).toLocaleString()}</p>
                  <p className='mt-2 text-lg font-bold text-white'>{m.from_name}</p>
                  <p className='text-sm text-gold-soft'>{m.from_email}</p>
                  {m.from_phone ? <p className='text-sm text-zinc-400'>{m.from_phone}</p> : null}
                  {m.subject ? <p className='mt-2 text-sm text-zinc-300'>{m.subject}</p> : null}
                </div>
                <span className='rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase text-zinc-400'>{m.status}</span>
              </div>
              <p className='mt-4 whitespace-pre-wrap text-sm text-zinc-300'>{m.body || '(no message body)'}</p>
              <form action={setMessageStatusAction} className='mt-4 flex flex-wrap gap-2'>
                <input type='hidden' name='id' value={m.id} />
                <button type='submit' name='status' value='read' className='rounded border border-white/20 px-2 py-1 text-xs text-zinc-300'>
                  Mark read
                </button>
                <button type='submit' name='status' value='replied' className='rounded border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300'>
                  Mark replied
                </button>
                <button type='submit' name='status' value='archived' className='rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-500'>
                  Archive
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <Link href='/admin' className='mt-8 inline-block text-xs font-bold uppercase text-gold-soft underline'>
        ← Admin
      </Link>
    </DashboardShell>
  );
}

import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { setMessageStatusAction } from '@/app/(dashboard)/admin/gallery-messages-actions';

export const dynamic = 'force-dynamic';

type Msg = {
  id: string;
  from_name: string;
  from_email: string;
  subject: string | null;
  body: string;
  status: string;
  created_at: string;
};

export default async function AdminMessagesPage() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();

  let rows: Msg[] = [];
  if (supabase && session.user) {
    const { data } = await supabase.from('messages').select('id, from_name, from_email, subject, body, status, created_at').order('created_at', { ascending: false }).limit(100);
    rows = (data ?? []) as Msg[];
  }

  return (
    <DashboardShell
      title='Message center'
      subtitle='Customer inquiries from the website contact form — mark read, reply by email, archive when done.'
      role='admin'
    >
      <div className='space-y-4'>
        {rows.length === 0 ? (
          <p className='rounded-2xl border border-white/10 bg-zinc-950 p-6 text-sm text-zinc-400'>No messages yet. They appear here when visitors submit the homepage contact form.</p>
        ) : null}
        {rows.map((m) => (
          <article
            key={m.id}
            className={`rounded-2xl border p-5 transition hover:shadow-[0_0_28px_rgba(212,166,77,0.12)] ${
              m.status === 'new' ? 'border-gold/50 bg-black/50' : 'border-gold/15 bg-zinc-950'
            }`}
          >
            <div className='flex flex-wrap items-start justify-between gap-4'>
              <div>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                    m.status === 'new' ? 'bg-gold/20 text-gold-soft' : 'bg-white/10 text-zinc-400'
                  }`}
                >
                  {m.status}
                </span>
                <p className='mt-2 text-lg font-bold text-white'>{m.from_name}</p>
                <p className='text-sm text-gold-soft'>{m.from_email}</p>
                {m.subject ? <p className='mt-1 text-sm text-zinc-400'>Subject: {m.subject}</p> : null}
                <p className='mt-3 whitespace-pre-wrap text-sm text-zinc-200'>{m.body}</p>
                <p className='mt-2 text-xs text-zinc-600'>{new Date(m.created_at).toLocaleString()}</p>
              </div>
              <div className='flex flex-col gap-2'>
                <a
                  href={`mailto:${encodeURIComponent(m.from_email)}?subject=${encodeURIComponent(`Re: ${m.subject ?? 'Gloss Boss ATX'}`)}`}
                  className='rounded-lg bg-gold px-4 py-2 text-center text-xs font-black uppercase tracking-wider text-black transition hover:brightness-110'
                >
                  Reply by email
                </a>
                {m.status === 'new' ? (
                  <form action={setMessageStatusAction}>
                    <input type='hidden' name='id' value={m.id} />
                    <input type='hidden' name='status' value='read' />
                    <button type='submit' className='w-full rounded-lg border border-gold/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gold-soft'>
                      Mark read
                    </button>
                  </form>
                ) : (
                  <form action={setMessageStatusAction}>
                    <input type='hidden' name='id' value={m.id} />
                    <input type='hidden' name='status' value='new' />
                    <button type='submit' className='w-full rounded-lg border border-white/15 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300'>
                      Mark unread
                    </button>
                  </form>
                )}
                <form action={setMessageStatusAction}>
                  <input type='hidden' name='id' value={m.id} />
                  <input type='hidden' name='status' value='archived' />
                  <button type='submit' className='w-full rounded-lg border border-white/10 px-4 py-2 text-xs text-zinc-500'>
                    Archive
                  </button>
                </form>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Link href='/admin' className='mt-8 inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
        ← Admin overview
      </Link>
    </DashboardShell>
  );
}

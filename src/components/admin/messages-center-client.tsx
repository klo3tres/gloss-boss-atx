'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { MessageRow } from '@/lib/messages-map';
import { replyToMessageAction, setMessageStatusAction } from '@/app/(dashboard)/admin/gallery-messages-actions';

function preview(body: string, max = 120) {
  const t = body.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function MessagesCenterClient({ rows }: { rows: MessageRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  const unread = rows.filter((r) => r.status === 'new').length;

  return (
    <div className='grid min-h-[480px] gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]'>
      <aside className='rounded-2xl border border-gold/20 bg-gradient-to-b from-black via-zinc-950 to-black p-3 shadow-[0_0_40px_rgba(212,166,77,0.08)]'>
        <div className='flex items-center justify-between border-b border-white/10 px-2 py-2'>
          <p className='text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft'>Inbox</p>
          {unread > 0 ? (
            <span className='rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold-soft'>{unread} new</span>
          ) : (
            <span className='text-[10px] text-zinc-500'>All caught up</span>
          )}
        </div>
        <ul className='mt-2 max-h-[70vh] space-y-1 overflow-y-auto pr-1'>
          {rows.map((m) => {
            const active = m.id === selectedId;
            const isNew = m.status === 'new';
            return (
              <li key={m.id}>
                <button
                  type='button'
                  onClick={() => {
                    setSelectedId(m.id);
                    if (m.status === 'new') {
                      const fd = new FormData();
                      fd.set('id', m.id);
                      fd.set('status', 'read');
                      void setMessageStatusAction(fd).then(() => router.refresh());
                    }
                  }}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    active
                      ? 'border-gold/50 bg-gold/10 shadow-[0_0_22px_rgba(212,166,77,0.18)]'
                      : 'border-transparent bg-black/30 hover:border-gold/25 hover:shadow-[0_0_18px_rgba(212,166,77,0.1)]'
                  }`}
                >
                  <div className='flex items-start justify-between gap-2'>
                    <p className='truncate text-sm font-bold text-white'>{m.from_name}</p>
                    {isNew ? <span className='h-2 w-2 shrink-0 rounded-full bg-gold shadow-[0_0_8px_rgba(212,166,77,0.9)]' /> : null}
                  </div>
                  <p className='truncate text-[11px] text-gold-soft/90'>{m.from_email}</p>
                  {m.from_phone ? <p className='truncate text-[10px] text-zinc-500'>{m.from_phone}</p> : null}
                  <p className='mt-1 line-clamp-2 text-[11px] text-zinc-400'>{preview(m.body)}</p>
                  <p className='mt-1 text-[9px] uppercase tracking-wider text-zinc-600'>{new Date(m.created_at).toLocaleString()}</p>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className='flex flex-col rounded-2xl border border-gold/20 bg-zinc-950/90 p-5 shadow-[0_0_36px_rgba(0,0,0,0.45)]'>
        {!selected ? (
          <p className='text-sm text-zinc-500'>Select a message.</p>
        ) : (
          <>
            <header className='border-b border-white/10 pb-4'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                  <p className='text-xs text-zinc-500'>{new Date(selected.created_at).toLocaleString()}</p>
                  <h2 className='mt-1 text-2xl font-black text-white'>{selected.from_name}</h2>
                  <p className='text-sm text-gold-soft'>{selected.from_email}</p>
                  {selected.from_phone ? <p className='text-sm text-zinc-400'>{selected.from_phone}</p> : null}
                  {selected.subject ? <p className='mt-2 text-sm text-zinc-300'>{selected.subject}</p> : null}
                </div>
                <span className='rounded-full border border-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300'>
                  {selected.status}
                </span>
              </div>
            </header>
            <div className='min-h-0 flex-1 overflow-y-auto py-4'>
              <p className='whitespace-pre-wrap text-sm leading-relaxed text-zinc-200'>{selected.body || '(no message body)'}</p>
            </div>
            <footer className='flex flex-wrap gap-2 border-t border-white/10 pt-4'>
              <form
                action={async (fd) => {
                  await replyToMessageAction(fd);
                  router.refresh();
                }}
                className='mb-2 w-full rounded-xl border border-white/10 bg-black/30 p-3'
              >
                <input type='hidden' name='id' value={selected.id} />
                <label className='text-[10px] font-black uppercase tracking-wider text-gold-soft'>
                  Reply
                  <textarea name='reply' rows={4} placeholder='Write a customer reply...' className='mt-2 w-full rounded border border-zinc-700 bg-black px-3 py-2 text-sm normal-case tracking-normal text-white' />
                </label>
                <button className='mt-2 rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Save / Send Reply</button>
                <p className='mt-2 text-[10px] text-zinc-500'>Saves the outbound reply and queues email when Resend is configured; otherwise it records a skipped outbox row.</p>
              </form>
              <form
                action={async (fd) => {
                  await setMessageStatusAction(fd);
                  router.refresh();
                }}
                className='contents'
              >
                <input type='hidden' name='id' value={selected.id} />
                <button
                  type='submit'
                  name='status'
                  value='read'
                  className='rounded-lg border border-white/20 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-200 transition hover:border-gold/40 hover:text-gold-soft'
                >
                  Mark read
                </button>
                <button
                  type='submit'
                  name='status'
                  value='replied'
                  className='rounded-lg border border-emerald-500/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-200 transition hover:bg-emerald-500/10'
                >
                  Mark replied
                </button>
                <button
                  type='submit'
                  name='status'
                  value='archived'
                  className='rounded-lg border border-zinc-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-400 transition hover:border-gold/30'
                >
                  Archive
                </button>
                <button
                  type='submit'
                  name='status'
                  value='new'
                  className='rounded-lg border border-amber-500/30 px-4 py-2 text-xs font-bold uppercase tracking-wider text-amber-200 transition hover:bg-amber-500/10'
                >
                  Restore
                </button>
              </form>
              <p className='w-full text-[11px] text-zinc-500'>
                Optional email reply from the browser requires{' '}
                <span className='text-gold-soft'>RESEND_API_KEY</span> on the server. If it is not set, use your mail client with the
                customer&apos;s address above.
              </p>
            </footer>
          </>
        )}
      </section>

      <p className='text-center text-[10px] text-zinc-600 lg:col-span-2'>
        <Link href='/admin' className='font-bold uppercase tracking-wider text-gold-soft underline'>
          ← Admin
        </Link>
      </p>
    </div>
  );
}

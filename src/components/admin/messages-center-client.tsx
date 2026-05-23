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

function chicago(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function MessagesCenterClient({ rows }: { rows: MessageRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);
  const [tab, setTab] = useState<'inbox' | 'sent' | 'drafts' | 'archived'>('inbox');

  const filteredRows = useMemo(() => rows.filter((r) => {
    if (r.status === 'deleted') return tab === 'archived';
    if (tab === 'archived') return r.status === 'archived' || r.status === 'deleted' || Boolean(r.archived_at);
    if (tab === 'sent') return r.status === 'replied' || Boolean(r.replied_at);
    if (tab === 'drafts') return r.status === 'draft';
    return r.status !== 'archived' && r.status !== 'deleted' && !r.archived_at;
  }), [rows, tab]);
  const selected = useMemo(() => filteredRows.find((r) => r.id === selectedId) ?? filteredRows[0] ?? null, [filteredRows, selectedId]);

  const unread = rows.filter((r) => r.status === 'new').length;

  return (
    <div className='grid min-h-[480px] gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]'>
      <aside className='rounded-2xl border border-gold/20 bg-gradient-to-b from-black via-zinc-950 to-black p-3 shadow-[0_0_40px_rgba(212,166,77,0.08)]'>
        <div className='flex items-center justify-between border-b border-white/10 px-2 py-2'>
          <p className='text-sm font-black uppercase tracking-[0.18em] text-gold-soft'>Messages</p>
          {unread > 0 ? (
            <span className='rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold-soft'>{unread} new</span>
          ) : (
            <span className='text-[10px] text-zinc-500'>All caught up</span>
          )}
        </div>
        <div className='mt-3 grid grid-cols-2 gap-2'>
          {(['inbox', 'sent', 'drafts', 'archived'] as const).map((t) => (
            <button key={t} type='button' onClick={() => setTab(t)} className={`rounded-xl border px-3 py-2 text-xs font-black uppercase ${tab === t ? 'border-gold/50 bg-gold/10 text-gold-soft' : 'border-white/10 text-zinc-400'}`}>
              {t}
            </button>
          ))}
        </div>
        <ul className='mt-2 max-h-[70vh] space-y-1 overflow-y-auto pr-1'>
          {filteredRows.map((m) => {
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
                  <p className='mt-1 text-[10px] uppercase tracking-wider text-zinc-600'>{chicago(m.created_at)}</p>
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
                  <p className='text-xs text-zinc-500'>{chicago(selected.created_at)}</p>
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
              <div className='space-y-3'>
                <article className='rounded-2xl border border-white/10 bg-black/35 p-4'>
                  <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>From {selected.from_name}</p>
                  <p className='mt-1 text-[11px] text-zinc-500'>{chicago(selected.created_at)}</p>
                  <p className='mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200'>{selected.body || '(no message body)'}</p>
                </article>
                {selected.reply_body ? (
                  <article className='ml-auto rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4'>
                    <p className='text-xs font-black uppercase tracking-wider text-emerald-200'>Gloss Boss reply</p>
                    <p className='mt-1 text-[11px] text-zinc-500'>{selected.replied_at ? chicago(selected.replied_at) : 'Saved reply'}</p>
                    <p className='mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-100'>{selected.reply_body}</p>
                  </article>
                ) : null}
              </div>
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
                  value='deleted'
                  className='rounded-lg border border-red-500/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-red-300 transition hover:bg-red-500/10'
                >
                  Delete
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

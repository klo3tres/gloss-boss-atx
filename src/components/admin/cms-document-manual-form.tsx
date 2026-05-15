'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

export function CmsDocumentManualForm() {
  const router = useRouter();
  const [category, setCategory] = useState('liability');
  const [title, setTitle] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  return (
    <form
      className='mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'
      onSubmit={(e) => {
        e.preventDefault();
        void (async () => {
          setBusy(true);
          setMsg(null);
          const res = await fetchWithTimeout('/api/admin/cms-documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, title: title.trim(), file_url: fileUrl.trim() }),
            credentials: 'same-origin',
            timeoutMs: 30000,
          });
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          setBusy(false);
          if (!res.ok || !data.ok) {
            setMsg({ type: 'err', text: data.error ?? 'Save failed' });
            return;
          }
          setMsg({ type: 'ok', text: 'Document saved.' });
          setTitle('');
          setFileUrl('');
          router.refresh();
        })();
      }}
    >
      <label className='block text-xs text-zinc-400'>
        Category
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
        >
          <option value='liability'>Liability</option>
          <option value='sop'>SOP</option>
          <option value='intake'>Intake</option>
          <option value='training'>Training</option>
          <option value='homepage_banner'>Homepage banner</option>
          <option value='other'>Other</option>
        </select>
      </label>
      <label className='block text-xs text-zinc-400'>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
        />
      </label>
      <label className='block text-xs text-zinc-400 sm:col-span-2'>
        File URL (optional if you uploaded above — paste CDN link when needed)
        <input
          value={fileUrl}
          onChange={(e) => setFileUrl(e.target.value)}
          type='url'
          placeholder='https://…'
          className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
        />
      </label>
      <button
        type='submit'
        disabled={busy || !fileUrl.trim()}
        className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40 sm:col-span-2 lg:col-span-4 lg:justify-self-start'
      >
        {busy ? 'Saving…' : 'Add document from URL'}
      </button>
      {msg ? (
        <p className={`sm:col-span-2 lg:col-span-4 text-sm ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}

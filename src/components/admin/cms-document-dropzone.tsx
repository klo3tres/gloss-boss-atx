'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

export function CmsDocumentDropzone({
  category,
  label,
}: {
  category: 'liability' | 'sop' | 'intake' | 'homepage_banner' | 'other';
  label: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).slice(0, 5);
      if (list.length === 0) return;
      setBusy(true);
      setMsg(null);
      let ok = 0;
      for (const file of list) {
        const fd = new FormData();
        fd.set('file', file);
        fd.set('category', category);
        fd.set('title', file.name.replace(/\.[^.]+$/, ''));
        try {
          const res = await fetchWithTimeout('/api/admin/cms-document-upload', {
            method: 'POST',
            body: fd,
            credentials: 'same-origin',
            timeoutMs: 120000,
          });
          const j = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            jsxTemplateReference?: boolean;
          };
          if (res.ok && j.ok) {
            ok += 1;
            if (j.jsxTemplateReference) setMsg('Uploaded as JSX template reference (stored safely). Use live intake for signing.');
          } else setMsg(j.error ?? 'Upload failed');
        } catch {
          setMsg('Network error');
        }
      }
      setBusy(false);
      if (ok > 0) {
        setMsg(`${ok} file(s) uploaded.`);
        router.refresh();
      }
    },
    [category, router],
  );

  return (
    <div className='rounded-xl border border-dashed border-gold/30 bg-black/40 p-4'>
      <p className='text-xs font-bold uppercase tracking-wider text-gold-soft'>{label}</p>
      <div
        role='button'
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload(e.dataTransfer.files);
        }}
        className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border px-4 py-8 transition ${
          drag ? 'border-gold bg-gold/10' : 'border-white/15 hover:border-gold/40'
        }`}
      >
        <Upload className='h-8 w-8 text-gold-soft' />
        <p className='mt-2 text-xs text-zinc-400'>PDF, images, HTML, or JSX/TSX (saved as plain text reference; not executed). Word: convert to PDF first.</p>
        <input
          ref={inputRef}
          type='file'
          className='hidden'
          accept='.pdf,image/*,.html,.htm,.txt,.jsx,.tsx'
          multiple
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {busy ? <p className='mt-2 text-xs text-zinc-500'>Uploading…</p> : null}
      {msg ? <p className='mt-2 text-xs text-amber-200'>{msg}</p> : null}
    </div>
  );
}

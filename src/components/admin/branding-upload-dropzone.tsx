'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

export function BrandingUploadDropzone({ settingKey, label }: { settingKey: 'navbar_logo' | 'homepage_logo'; label: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      setMsg(null);
      const fd = new FormData();
      fd.set('file', file);
      fd.set('settingKey', settingKey);
      try {
        const res = await fetchWithTimeout('/api/admin/branding-upload', {
          method: 'POST',
          body: fd,
          credentials: 'same-origin',
          timeoutMs: 60000,
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; url?: string };
        if (!res.ok || !j.ok) {
          setMsg(j.error ?? 'Upload failed');
        } else {
          setMsg('Logo updated.');
          router.refresh();
        }
      } catch {
        setMsg('Network error');
      } finally {
        setBusy(false);
      }
    },
    [settingKey, router],
  );

  return (
    <div className='rounded-xl border border-gold/20 bg-black/40 p-4'>
      <p className='text-xs font-bold uppercase tracking-wider text-gold-soft'>{label}</p>
      <button
        type='button'
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className='mt-3 flex w-full flex-col items-center rounded-lg border border-dashed border-white/20 px-4 py-6 hover:border-gold/40 disabled:opacity-50'
      >
        <Upload className='h-6 w-6 text-gold-soft' />
        <span className='mt-2 text-xs text-zinc-400'>{busy ? 'Uploading…' : 'Drop image or click'}</span>
      </button>
      <input
        ref={inputRef}
        type='file'
        accept='image/*'
        className='hidden'
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = '';
        }}
      />
      {msg ? <p className='mt-2 text-xs text-emerald-300'>{msg}</p> : null}
    </div>
  );
}

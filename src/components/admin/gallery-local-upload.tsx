'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

type Staged = { id: string; file: File; previewUrl: string };

export function GalleryLocalUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [galleryReady, setGalleryReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchWithTimeout('/api/admin/gallery-bucket-status', { credentials: 'same-origin', timeoutMs: 15000 })
      .then(async (r) => {
        try {
          const j = (await r.json()) as { galleryReady?: boolean; ok?: boolean };
          if (!cancelled) setGalleryReady(Boolean(j.galleryReady));
        } catch {
          if (!cancelled) setGalleryReady(null);
        }
      })
      .catch(() => {
        if (!cancelled) setGalleryReady(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.size > 0 && f.type.startsWith('image/'));
    if (list.length === 0) return;
    setMsg(null);
    setStaged((prev) => {
      const next = [...prev];
      for (const file of list.slice(0, Math.max(0, 12 - prev.length))) {
        next.push({ id: `${file.name}-${file.size}-${next.length}-${Date.now()}`, file, previewUrl: URL.createObjectURL(file) });
      }
      return next.slice(0, 12);
    });
  }, []);

  const removeStaged = useCallback((id: string) => {
    setStaged((prev) => {
      const row = prev.find((s) => s.id === id);
      if (row) URL.revokeObjectURL(row.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const uploadStaged = useCallback(async () => {
    if (staged.length === 0) return;
    if (galleryReady === false) {
      setMsg('Storage bucket not configured yet. Uploads are temporarily disabled.');
      return;
    }
    setBusy(true);
    setMsg(null);
    const failed: Staged[] = [];
    let lastErr: string | null = null;
    const toUpload = [...staged];
    try {
      for (const row of toUpload) {
        try {
          const fd = new FormData();
          fd.set('file', row.file);
          const res = await fetchWithTimeout('/api/admin/gallery-upload', {
            method: 'POST',
            body: fd,
            credentials: 'same-origin',
            timeoutMs: 120000,
          });
          const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
          if (!res.ok) {
            console.warn('[CRM_DEBUG_UI]', 'gallery_upload', res.status, j);
            lastErr = j.error ?? `Upload failed (${res.status})`;
            if (j.code === 'BUCKET_MISSING') {
              setGalleryReady(false);
              lastErr = 'Storage bucket not configured yet. Uploads are temporarily disabled.';
            }
            failed.push(row);
            continue;
          }
          URL.revokeObjectURL(row.previewUrl);
        } catch (e) {
          console.warn('[CRM_DEBUG_UI]', 'gallery_upload_network', e);
          lastErr = 'Network error during upload.';
          failed.push(row);
        }
      }
      setStaged(failed);
      router.refresh();
      if (failed.length === 0) {
        setMsg('Upload complete.');
      } else {
        setMsg(`${lastErr ?? 'Some uploads failed.'} ${failed.length} file(s) still queued — fix issues and retry.`);
      }
    } finally {
      setBusy(false);
    }
  }, [router, staged, galleryReady]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  return (
    <div className='mt-4 space-y-2'>
      <p className='text-xs font-bold uppercase tracking-wider text-gold-soft'>Local upload (drag & drop)</p>
      {galleryReady === false ? (
        <p className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100' role='status'>
          Storage bucket not configured yet. Uploads are temporarily disabled.
        </p>
      ) : null}
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm transition ${
          drag ? 'border-gold bg-gold/10 text-gold-soft' : 'border-white/20 bg-black/30 text-zinc-400 hover:border-gold/40'
        } ${galleryReady === false ? 'pointer-events-none opacity-50' : ''}`}
        onClick={() => {
          if (galleryReady !== false) inputRef.current?.click();
        }}
        role='button'
        tabIndex={0}
        onKeyDown={(e) => {
          if (galleryReady !== false && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click();
        }}
        aria-label='Upload gallery images from your computer'
      >
        <Upload className='h-8 w-8 text-gold-soft' aria-hidden />
        <span>Drop images here or click to choose files (JPEG, PNG, WebP, GIF · max 5MB each)</span>
        <span className='text-xs text-zinc-500'>Uploads to Supabase Storage bucket &quot;gallery&quot; then publishes to homepage.</span>
      </div>
      <input
        ref={inputRef}
        type='file'
        accept='image/jpeg,image/png,image/webp,image/gif'
        multiple
        className='hidden'
        disabled={galleryReady === false}
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {staged.length > 0 ? (
        <div className='space-y-2'>
          <p className='text-xs text-zinc-400'>Preview ({staged.length}) — review then upload.</p>
          <div className='grid grid-cols-3 gap-2 sm:grid-cols-4'>
            {staged.map((s) => (
              <div key={s.id} className='relative overflow-hidden rounded-lg border border-gold/20 bg-zinc-900'>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.previewUrl} alt='' className='h-24 w-full object-cover' />
                <button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation();
                    removeStaged(s.id);
                  }}
                  className='absolute right-1 top-1 rounded bg-black/70 p-1 text-zinc-200 hover:text-white'
                  aria-label='Remove from queue'
                >
                  <X className='h-4 w-4' />
                </button>
              </div>
            ))}
          </div>
          <button
            type='button'
            disabled={busy || galleryReady === false}
            onClick={() => void uploadStaged()}
            className='w-full rounded-lg border border-gold/40 bg-gold/15 py-2 text-xs font-bold uppercase tracking-wider text-gold-soft hover:bg-gold/25 disabled:opacity-50'
          >
            {busy ? 'Uploading…' : `Upload ${staged.length} image${staged.length === 1 ? '' : 's'}`}
          </button>
        </div>
      ) : null}

      {busy && staged.length === 0 ? <p className='text-xs text-zinc-400'>Uploading…</p> : null}
      {msg ? <p className='text-xs text-amber-200'>{msg}</p> : null}
    </div>
  );
}

'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

type Slide = { id: string; label: string; image: string };

function parseSlides(json: string): Slide[] {
  try {
    const o = JSON.parse(json) as { slides?: unknown };
    if (!Array.isArray(o.slides)) return [];
    return o.slides
      .map((s, i) => {
        if (!s || typeof s !== 'object') return null;
        const r = s as Record<string, unknown>;
        const image = typeof r.image === 'string' ? r.image.trim() : '';
        if (!image) return null;
        return {
          id: String(r.id ?? `slide-${i + 1}`),
          label: typeof r.label === 'string' ? r.label : `Transformation ${i + 1}`,
          image,
        };
      })
      .filter((x): x is Slide => x != null);
  } catch {
    return [];
  }
}

export function FeaturedShowcaseManager({ initialJson }: { initialJson: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [slides, setSlides] = useState<Slide[]>(() => parseSlides(initialJson));
  const [json, setJson] = useState(initialJson);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    setSlides(parseSlides(initialJson));
    setJson(initialJson);
  }, [initialJson]);

  const syncJson = useCallback((next: Slide[]) => {
    setSlides(next);
    setJson(JSON.stringify({ slides: next }, null, 2));
  }, []);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      setMsg(null);
      setSaveFeedback(null);
      const fd = new FormData();
      fd.set('file', file);
      fd.set('caption', file.name.replace(/\.[^.]+$/, ''));
      try {
        const res = await fetchWithTimeout('/api/admin/gallery-upload', {
          method: 'POST',
          body: fd,
          credentials: 'same-origin',
          timeoutMs: 120000,
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
        if (!res.ok || !j.ok || !j.url) {
          setMsg(j.error ?? 'Upload failed');
          return;
        }
        const next: Slide = { id: `slide-${Date.now()}`, label: file.name.replace(/\.[^.]+$/, ''), image: j.url };
        syncJson([...slides, next]);
        setMsg('Image added to showcase.');
        router.refresh();
      } catch {
        setMsg('Network error');
      } finally {
        setBusy(false);
      }
    },
    [router, slides, syncJson],
  );

  const onDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setSlides((prev) => {
      const from = prev.findIndex((x) => x.id === dragId);
      const to = prev.findIndex((x) => x.id === overId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      syncJson(next);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    setSaveFeedback(null);
    try {
      const res = await fetchWithTimeout('/api/admin/featured-showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json }),
        credentials: 'same-origin',
        timeoutMs: 60000,
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string };
      if (!res.ok || !data.ok) {
        const detail = data.error ?? `Save failed (${res.status})`;
        setSaveFeedback({
          kind: 'err',
          text: data.code === 'TABLE_OR_POLICY' ? `${detail} Set SUPABASE_SERVICE_ROLE_KEY on the server for reliable CMS writes.` : detail,
        });
        return;
      }
      setSaveFeedback({
        kind: 'ok',
        text: 'Featured showcase saved. Homepage reads key `featured_showcase` in `homepage_content` — refresh the home page to confirm.',
      });
      router.refresh();
    } catch {
      setSaveFeedback({ kind: 'err', text: 'Network error — could not reach the server.' });
    } finally {
      setBusy(false);
    }
  };

  const preview = useMemo(() => slides, [slides]);

  return (
    <div className='mt-4 space-y-4'>
      <div
        role='button'
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void upload(f);
        }}
        className='flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-gold/30 bg-black/40 px-4 py-8 hover:border-gold/50'
      >
        <Upload className='h-8 w-8 text-gold-soft' />
        <p className='mt-2 text-xs text-zinc-400'>Drag & drop before/after images or click to upload</p>
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
      </div>

      {preview.length > 0 ? (
        <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {preview.map((s, idx) => (
            <li
              key={s.id}
              draggable
              onDragStart={() => setDragId(s.id)}
              onDragOver={(e) => onDragOver(e, s.id)}
              onDragEnd={() => setDragId(null)}
              className='overflow-hidden rounded-xl border border-white/10 bg-black/50'
            >
              <div className='relative aspect-[4/3]'>
                <Image src={s.image} alt={s.label} fill className='object-cover' sizes='33vw' unoptimized />
                <span className='absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] text-white'>#{idx + 1}</span>
              </div>
              <div className='p-2'>
                <input
                  value={s.label}
                  onChange={(e) => {
                    const next = slides.map((x) => (x.id === s.id ? { ...x, label: e.target.value } : x));
                    syncJson(next);
                  }}
                  className='w-full rounded border border-zinc-700 bg-black px-2 py-1 text-xs text-white'
                />
                <button
                  type='button'
                  className='mt-2 text-[10px] text-red-300'
                  onClick={() => syncJson(slides.filter((x) => x.id !== s.id))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-sm text-zinc-500'>No slides yet — upload images above.</p>
      )}

      <details className='rounded-lg border border-white/10 bg-black/30 p-3'>
        <summary className='cursor-pointer text-xs font-bold uppercase text-zinc-400'>Advanced JSON</summary>
        <textarea
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            setSlides(parseSlides(e.target.value));
          }}
          rows={8}
          className='mt-2 w-full rounded border border-zinc-700 bg-black px-2 py-1 font-mono text-xs text-white'
        />
      </details>

      <button
        type='button'
        disabled={busy}
        onClick={() => void save()}
        className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black disabled:opacity-50'
      >
        {busy ? 'Saving…' : 'Save featured showcase'}
      </button>
      {saveFeedback ? (
        <p
          role={saveFeedback.kind === 'err' ? 'alert' : 'status'}
          className={`text-sm font-medium ${saveFeedback.kind === 'err' ? 'text-rose-300' : 'text-emerald-300'}`}
        >
          {saveFeedback.text}
        </p>
      ) : null}
      {msg ? <p className='text-xs text-zinc-400'>{msg}</p> : null}
    </div>
  );
}

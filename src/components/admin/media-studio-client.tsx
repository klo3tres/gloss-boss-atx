'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { MediaAsset } from '@/lib/media-studio';
import { MEDIA_PLACEMENTS } from '@/lib/media-studio';

export function MediaStudioClient({ initialItems, tablesReady }: { initialItems: MediaAsset[]; tablesReady: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [placement, setPlacement] = useState('homepage_hero_video');
  const [externalUrl, setExternalUrl] = useState('');

  if (!tablesReady) {
    return (
      <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        Apply migration <code className="text-gold-soft">000106_titan_polish_foundation.sql</code> to enable Media Studio.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-black/45 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Upload or link media</p>
        <p className="mt-1 text-xs text-zinc-500">Upload images/videos to Supabase gallery storage, or paste an external URL.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            Placement
            <select value={placement} onChange={(e) => setPlacement(e.target.value)} className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white">
              {MEDIA_PLACEMENTS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-zinc-400">
            External URL (optional)
            <input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://..." className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black">
            {busy ? 'Uploading…' : 'Choose file'}
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void (async () => {
                  setBusy(true);
                  setMsg(null);
                  const fd = new FormData();
                  fd.set('file', file);
                  fd.set('placement', placement);
                  if (externalUrl.trim()) fd.set('externalUrl', externalUrl.trim());
                  const res = await fetchWithTimeout('/api/admin/media-studio', { method: 'POST', body: fd, credentials: 'same-origin', timeoutMs: 120000 });
                  const data = (await res.json()) as { ok?: boolean; error?: string };
                  setBusy(false);
                  if (!res.ok || !data.ok) {
                    setMsg(data.error ?? 'Upload failed');
                    return;
                  }
                  setMsg('Uploaded.');
                  router.refresh();
                })();
              }}
            />
          </label>
          {externalUrl.trim() ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  const fd = new FormData();
                  fd.set('placement', placement);
                  fd.set('externalUrl', externalUrl.trim());
                  const res = await fetchWithTimeout('/api/admin/media-studio', { method: 'POST', body: fd, credentials: 'same-origin', timeoutMs: 30000 });
                  const data = (await res.json()) as { ok?: boolean; error?: string };
                  setBusy(false);
                  setMsg(data.ok ? 'Saved URL.' : data.error ?? 'Failed');
                  if (data.ok) router.refresh();
                })();
              }}
              className="rounded-xl border border-gold/30 px-4 py-2 text-[10px] font-black uppercase text-gold-soft disabled:opacity-50"
            >
              Save URL only
            </button>
          ) : null}
        </div>
        {msg ? <p className="mt-2 text-xs text-emerald-300">{msg}</p> : null}
      </section>

      <ul className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const url = item.publicUrl || item.externalUrl;
          return (
            <li key={item.id} className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-white">{item.title ?? item.placement}</p>
                  <p className="text-[10px] uppercase text-zinc-500">{item.placement} · {item.mediaType}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${item.isActive ? 'bg-emerald-500/15 text-emerald-200' : 'bg-zinc-800 text-zinc-500'}`}>
                  {item.isActive ? 'Active' : 'Off'}
                </span>
              </div>
              {url && item.mediaType === 'video' ? (
                <video src={url} controls muted className="mt-3 max-h-40 w-full rounded-xl bg-black object-cover" poster={item.posterUrl ?? undefined} />
              ) : url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={item.altText ?? ''} className="mt-3 max-h-40 w-full rounded-xl object-cover" />
              ) : null}
              <button
                type="button"
                className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-white"
                onClick={() => {
                  void (async () => {
                    await fetchWithTimeout('/api/admin/media-studio', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
                      credentials: 'same-origin',
                      timeoutMs: 15000,
                    });
                    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, isActive: !x.isActive } : x)));
                    router.refresh();
                  })();
                }}
              >
                {item.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

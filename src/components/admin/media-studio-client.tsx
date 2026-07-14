'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { MediaAsset } from '@/lib/media-studio';
import { MEDIA_PLACEMENTS, groupMediaByPlacement } from '@/lib/media-studio';

function cropStyle(settings: Record<string, unknown> | null | undefined) {
  const x = Number(settings?.focalX ?? 50);
  const y = Number(settings?.focalY ?? 50);
  const zoom = Math.max(1, Number(settings?.zoom ?? 1));
  return {
    objectPosition: `${x}% ${y}%`,
    transform: zoom > 1 ? `scale(${zoom})` : undefined,
  };
}

function MediaAssetCard({
  item,
  onRefresh,
}: {
  item: MediaAsset;
  onRefresh: () => void;
}) {
  const [focalX, setFocalX] = useState(Number(item.cropSettings?.focalX ?? 50));
  const [focalY, setFocalY] = useState(Number(item.cropSettings?.focalY ?? 50));
  const [zoom, setZoom] = useState(Number(item.cropSettings?.zoom ?? 1));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const url = item.publicUrl || item.externalUrl;

  return (
    <li className="rounded-2xl border border-white/10 bg-black/40 p-4">
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
        <img src={url} alt={item.altText ?? ''} className="mt-3 max-h-40 w-full rounded-xl object-cover" style={cropStyle({ focalX, focalY, zoom })} />
      ) : null}
      {url && item.mediaType === 'image' ? (
        <div className="mt-3 space-y-2 rounded-xl border border-white/5 bg-black/30 p-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Crop / focal</p>
          <label className="block text-[10px] text-zinc-400">
            Horizontal focal ({focalX}%)
            <input type="range" min={0} max={100} value={focalX} onChange={(e) => setFocalX(Number(e.target.value))} className="mt-1 w-full accent-gold" />
          </label>
          <label className="block text-[10px] text-zinc-400">
            Vertical focal ({focalY}%)
            <input type="range" min={0} max={100} value={focalY} onChange={(e) => setFocalY(Number(e.target.value))} className="mt-1 w-full accent-gold" />
          </label>
          <label className="block text-[10px] text-zinc-400">
            Zoom ({zoom.toFixed(1)}x)
            <input type="range" min={1} max={2} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="mt-1 w-full accent-gold" />
          </label>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-gold/30 px-3 py-1.5 text-[9px] font-black uppercase text-gold-soft disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setBusy(true);
                await fetchWithTimeout('/api/admin/media-studio', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: item.id, cropSettings: { focalX, focalY, zoom } }),
                  credentials: 'same-origin',
                  timeoutMs: 15000,
                });
                setBusy(false);
                onRefresh();
              })();
            }}
          >
            {busy ? 'Saving…' : 'Save crop'}
          </button>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-300 hover:text-white">
            Preview
          </a>
        ) : null}
        <button
          type="button"
          className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-white"
          onClick={() => {
            void (async () => {
              await fetchWithTimeout('/api/admin/media-studio', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
                credentials: 'same-origin',
                timeoutMs: 15000,
              });
              onRefresh();
            })();
          }}
        >
          {item.isActive ? 'Deactivate' : 'Activate'}
        </button>
        {(item.mediaType === 'image' || item.mediaType === 'video') ? (
          <button
            type="button"
            disabled={busy || !url}
            className="rounded-lg border border-gold/35 bg-gold/10 px-3 py-2 text-[10px] font-black uppercase text-gold-soft disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setBusy(true);
                setMessage(null);
                const res = await fetchWithTimeout('/api/admin/media-studio', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: item.id, setAsHomepageHero: true }),
                  credentials: 'same-origin',
                  timeoutMs: 15000,
                });
                const data = (await res.json()) as { ok?: boolean; error?: string };
                setBusy(false);
                setMessage(data.ok ? 'Now live on the homepage.' : data.error ?? 'Could not set homepage hero.');
                if (data.ok) onRefresh();
              })();
            }}
          >
            Set as homepage hero
          </button>
        ) : null}
      </div>
      {message ? <p className={`mt-2 text-xs ${message.includes('live') ? 'text-emerald-300' : 'text-rose-300'}`}>{message}</p> : null}
    </li>
  );
}

export function MediaStudioClient({ initialItems, tablesReady }: { initialItems: MediaAsset[]; tablesReady: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [placement, setPlacement] = useState('homepage_hero_image');
  const [externalUrl, setExternalUrl] = useState('');
  const grouped = useMemo(() => groupMediaByPlacement(items), [items]);
  const liveHero = useMemo(
    () => items.find((item) => item.isActive && item.placement === 'homepage_hero_image')
      ?? items.find((item) => item.isActive && item.placement === 'homepage_hero_video')
      ?? null,
    [items],
  );
  const refresh = () => router.refresh();

  useEffect(() => setItems(initialItems), [initialItems]);

  if (!tablesReady) {
    return (
      <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        Apply migration <code className="text-gold-soft">000106_titan_polish_foundation.sql</code> to enable Media Studio.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className={`rounded-2xl border p-5 ${liveHero ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Currently live</p>
        {liveHero ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-[180px_1fr]">
            {liveHero.mediaType === 'video' ? (
              <video src={liveHero.publicUrl || liveHero.externalUrl || ''} muted controls className="h-28 w-full rounded-xl bg-black object-cover" poster={liveHero.posterUrl ?? undefined} />
            ) : (
              <img src={liveHero.publicUrl || liveHero.externalUrl || ''} alt={liveHero.altText ?? ''} className="h-28 w-full rounded-xl object-cover" style={cropStyle(liveHero.cropSettings)} />
            )}
            <dl className="grid content-start gap-1 text-xs text-zinc-300">
              <div><dt className="inline text-zinc-500">Asset ID: </dt><dd className="inline font-mono">{liveHero.id}</dd></div>
              <div><dt className="inline text-zinc-500">Placement: </dt><dd className="inline">{liveHero.placement}</dd></div>
              <div><dt className="inline text-zinc-500">Active: </dt><dd className="inline text-emerald-300">Yes</dd></div>
              <div><dt className="inline text-zinc-500">Public URL: </dt><dd className="inline">{liveHero.publicUrl || liveHero.externalUrl ? 'Configured' : 'Missing'}</dd></div>
            </dl>
          </div>
        ) : (
          <p className="mt-2 text-sm text-amber-100">No active homepage hero is selected. Choose an asset below and set it live.</p>
        )}
      </section>
      <section className="rounded-2xl border border-white/10 bg-black/45 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Upload asset</p>
        <p className="mt-1 text-xs text-zinc-500">Primary method: choose a file — uploads go directly to Supabase storage. URL is optional.</p>
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
                  refresh();
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
                  if (data.ok) refresh();
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

      {grouped.map(([group, groupItems]) => (
        <section key={group}>
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">{group} ({groupItems.length})</p>
          <ul className="grid gap-4 md:grid-cols-2">
            {groupItems.map((item) => (
              <MediaAssetCard key={item.id} item={item} onRefresh={refresh} />
            ))}
          </ul>
        </section>
      ))}
      {items.length === 0 ? <p className="text-sm text-zinc-500">No media assets yet. Upload your first file above.</p> : null}
    </div>
  );
}

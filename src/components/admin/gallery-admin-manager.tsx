'use client';

import Image from 'next/image';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { safeImageUrl } from '@/lib/gallery-normalize';

export type GalleryAdminItem = {
  id: string;
  caption: string | null;
  url: string;
  sort_order: number;
  published: boolean;
  featured: boolean;
};

async function galleryMutate(body: object): Promise<{ ok: boolean; error?: string }> {
  const res = await fetchWithTimeout('/api/admin/gallery/mutate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    timeoutMs: 60000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Request failed (${res.status})` };
  }
  return { ok: true };
}

export function GalleryAdminManager({ rows }: { rows: GalleryAdminItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(rows);
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const onDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setItems((prev) => {
      const from = prev.findIndex((x) => x.id === dragId);
      const to = prev.findIndex((x) => x.id === overId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((r, i) => ({ ...r, sort_order: (i + 1) * 10 }));
    });
  };

  const saveOrder = useCallback(async () => {
    setSaving(true);
    setMsg(null);
    const r = await galleryMutate({ op: 'reorder', order: items.map((x) => x.id) });
    if (r.ok) {
      setMsg('Order saved.');
      router.refresh();
    } else {
      setMsg(r.error ?? 'Could not save order.');
    }
    setSaving(false);
  }, [items, router]);

  const togglePublished = async (row: GalleryAdminItem) => {
    setBusyId(row.id);
    setMsg(null);
    const next = !row.published;
    const r = await galleryMutate({ op: 'toggle-published', id: row.id, published: next });
    if (r.ok) {
      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, published: next } : x)));
      router.refresh();
    } else {
      setMsg(r.error ?? 'Publish toggle failed.');
    }
    setBusyId(null);
  };

  const toggleFeatured = async (row: GalleryAdminItem) => {
    setBusyId(row.id);
    setMsg(null);
    const next = !row.featured;
    const r = await galleryMutate({ op: 'toggle-featured', id: row.id, featured: next });
    if (r.ok) {
      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, featured: next } : x)));
      router.refresh();
    } else {
      setMsg(r.error ?? 'Feature toggle failed.');
    }
    setBusyId(null);
  };

  const remove = async (row: GalleryAdminItem) => {
    if (!confirm('Remove this gallery image from the CMS?')) return;
    setBusyId(row.id);
    setMsg(null);
    const r = await galleryMutate({ op: 'delete', id: row.id });
    if (r.ok) {
      setItems((prev) => prev.filter((x) => x.id !== row.id));
      router.refresh();
    } else {
      setMsg(r.error ?? 'Delete failed.');
    }
    setBusyId(null);
  };

  if (items.length === 0) {
    return <p className='text-sm text-zinc-500'>No gallery images yet. Upload above or paste a URL.</p>;
  }

  return (
    <div className='mt-6 space-y-3'>
      <p className='text-xs text-zinc-500'>Drag thumbnails to reorder. Order numbers update when you save.</p>
      <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
        {items.map((row, idx) => {
          const src = safeImageUrl({ url: row.url, image_url: row.url });
          const pending = busyId === row.id;
          return (
            <li
              key={row.id}
              draggable
              onDragStart={() => setDragId(row.id)}
              onDragOver={(e) => onDragOver(e, row.id)}
              onDragEnd={() => setDragId(null)}
              className={`cursor-grab overflow-hidden rounded-xl border bg-black/50 active:cursor-grabbing ${
                dragId === row.id ? 'border-gold' : 'border-white/10'
              }`}
            >
              <div className='relative aspect-[4/3] w-full bg-zinc-900'>
                <Image src={src} alt={row.caption ?? 'Gallery'} fill className='object-cover' sizes='(max-width:768px) 50vw, 33vw' unoptimized />
                <span className='absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white'>#{idx + 1}</span>
              </div>
              <div className='space-y-2 p-3'>
                <p className='text-[10px] text-zinc-500'>order {row.sort_order}</p>
                {row.caption ? <p className='truncate text-xs text-zinc-300'>{row.caption}</p> : null}
                <div className='flex flex-wrap gap-1'>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${row.published ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700 text-zinc-400'}`}>
                    {row.published ? 'Published' : 'Draft'}
                  </span>
                  {row.featured ? (
                    <span className='rounded bg-gold/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gold-soft'>Featured</span>
                  ) : null}
                </div>
                <div className='flex flex-wrap gap-1'>
                  <button
                    type='button'
                    disabled={pending}
                    onClick={() => void togglePublished(row)}
                    className='rounded border border-gold/40 px-2 py-1 text-[10px] font-bold uppercase text-gold-soft disabled:opacity-40'
                  >
                    {row.published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type='button'
                    disabled={pending}
                    onClick={() => void toggleFeatured(row)}
                    className='rounded border border-white/20 px-2 py-1 text-[10px] font-bold uppercase text-zinc-200 disabled:opacity-40'
                  >
                    {row.featured ? 'Unfeature' : 'Feature'}
                  </button>
                  <button
                    type='button'
                    disabled={pending}
                    onClick={() => void remove(row)}
                    className='rounded border border-red-500/40 px-2 py-1 text-[10px] font-bold uppercase text-red-300 disabled:opacity-40'
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type='button'
        disabled={saving}
        onClick={() => void saveOrder()}
        className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
      >
        {saving ? 'Saving…' : 'Save gallery order'}
      </button>
      {msg ? <p className='text-xs text-emerald-300'>{msg}</p> : null}
    </div>
  );
}

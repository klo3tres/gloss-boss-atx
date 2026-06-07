'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
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
  watermark?: boolean;
  vehicleLabel?: string | null;
  serviceLabel?: string | null;
  transformationPhase?: string | null;
};

async function galleryMutate(
  body: {
    op: string;
    id?: string;
    caption?: string;
    published?: boolean;
    featured?: boolean;
    order?: string[];
    direction?: 'up' | 'down';
    vehicleLabel?: string | null;
    serviceLabel?: string | null;
    transformationPhase?: string | null;
    watermark?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
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
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    setItems(rows);
  }, [rows]);

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
    setFeedback(null);
    const r = await galleryMutate({ op: 'reorder', order: items.map((x) => x.id) });
    if (r.ok) {
      setFeedback({ kind: 'ok', text: 'Gallery order saved. Public site will refresh on next visit.' });
      router.refresh();
    } else {
      setFeedback({ kind: 'err', text: r.error ?? 'Could not save order.' });
    }
    setSaving(false);
  }, [items, router]);

  const togglePublished = async (row: GalleryAdminItem) => {
    setBusyId(row.id);
    setFeedback(null);
    const next = !row.published;
    const r = await galleryMutate({ op: 'toggle-published', id: row.id, published: next });
    if (r.ok) {
      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, published: next } : x)));
      setFeedback({ kind: 'ok', text: next ? 'Image published.' : 'Image unpublished.' });
      router.refresh();
    } else {
      setFeedback({ kind: 'err', text: r.error ?? 'Publish toggle failed.' });
    }
    setBusyId(null);
  };

  const toggleFeatured = async (row: GalleryAdminItem) => {
    setBusyId(row.id);
    setFeedback(null);
    const next = !row.featured;
    const r = await galleryMutate({ op: 'toggle-featured', id: row.id, featured: next });
    if (r.ok) {
      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, featured: next } : x)));
      setFeedback({ kind: 'ok', text: next ? 'Marked as featured.' : 'Removed from featured.' });
      router.refresh();
    } else {
      setFeedback({ kind: 'err', text: r.error ?? 'Feature toggle failed.' });
    }
    setBusyId(null);
  };

  const updateFields = async (row: GalleryAdminItem, fields: {
    caption?: string;
    vehicleLabel?: string | null;
    serviceLabel?: string | null;
    transformationPhase?: string | null;
    watermark?: boolean;
  }) => {
    setBusyId(row.id);
    setFeedback(null);
    const r = await galleryMutate({
      op: 'updateFields',
      id: row.id,
      ...fields
    });
    if (r.ok) {
      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...fields } : x)));
      setFeedback({ kind: 'ok', text: 'Image fields updated.' });
      router.refresh();
    } else {
      setFeedback({ kind: 'err', text: r.error ?? 'Update failed.' });
    }
    setBusyId(null);
  };

  const remove = async (row: GalleryAdminItem) => {
    if (!confirm('Remove this gallery image from the CMS?')) return;
    setBusyId(row.id);
    setFeedback(null);
    const r = await galleryMutate({ op: 'delete', id: row.id });
    if (r.ok) {
      setItems((prev) => prev.filter((x) => x.id !== row.id));
      setFeedback({ kind: 'ok', text: 'Image removed.' });
      router.refresh();
    } else {
      setFeedback({ kind: 'err', text: r.error ?? 'Delete failed.' });
    }
    setBusyId(null);
  };

  // Apply Filters
  const filteredItems = items.filter((item) => {
    const searchLower = searchTerm.toLowerCase();
    const captionMatch = (item.caption || '').toLowerCase().includes(searchLower);
    const vehicleMatch = (item.vehicleLabel || '').toLowerCase().includes(searchLower);
    const serviceMatch = (item.serviceLabel || '').toLowerCase().includes(searchLower);
    if (searchTerm && !captionMatch && !vehicleMatch && !serviceMatch) return false;

    if (phaseFilter !== 'all') {
      const itemPhase = item.transformationPhase || '';
      if (phaseFilter === 'before' && itemPhase !== 'before') return false;
      if (phaseFilter === 'after' && itemPhase !== 'after') return false;
      if (phaseFilter === 'before_after' && itemPhase !== 'before_after') return false;
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'draft' && item.published) return false;
      if (statusFilter === 'published' && !item.published) return false;
      if (statusFilter === 'featured' && !item.featured) return false;
    }

    return true;
  });

  return (
    <div className='mt-6 space-y-4'>
      {/* Interactive Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-black/40 border border-white/10 rounded-xl p-4">
        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">Search Gallery</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-gold"
            placeholder="Search title, vehicle, service..."
          />
        </div>
        
        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">Phase Filter</label>
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            className="w-full rounded border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-gold"
          >
            <option value="all">All Phases</option>
            <option value="before">Before</option>
            <option value="after">After</option>
            <option value="before_after">Before / After Pair</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">Status Filter</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-gold"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft / Offline</option>
            <option value="featured">Featured Transformations</option>
          </select>
        </div>
      </div>

      <p className='text-xs text-zinc-500'>Drag thumbnails to reorder, then save. Featured items sort first on the public gallery.</p>
      
      {filteredItems.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">No gallery images match active filters.</p>
      ) : (
        <div className="max-h-[min(80vh,70rem)] overflow-y-auto rounded-xl border border-white/10 bg-black/20 py-2 pl-2 pr-1">
          <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {filteredItems.map((row) => {
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
                    dragId === row.id ? 'border-gold shadow-[0_0_12px_rgba(212,175,55,0.2)]' : 'border-white/10'
                  }`}
                >
                  <div className='relative aspect-[4/3] w-full bg-zinc-900'>
                    <Image src={src} alt={row.caption ?? 'Gallery'} fill className='object-cover' sizes='(max-width:768px) 50vw, 33vw' unoptimized />
                  </div>
                  <div className='space-y-2.5 p-3.5 text-left'>
                    {/* Inline Editor Fields */}
                    <label className='block text-[9px] font-black uppercase text-zinc-500'>
                      Public Title / Caption
                      <input
                        key={`${row.id}-caption`}
                        defaultValue={row.caption ?? ''}
                        disabled={pending}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (row.caption ?? '').trim()) void updateFields(row, { caption: v });
                        }}
                        className='mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white'
                        placeholder='Before — SUV interior'
                      />
                    </label>

                    <label className='block text-[9px] font-black uppercase text-zinc-500'>
                      Vehicle Label
                      <input
                        key={`${row.id}-vehicle`}
                        defaultValue={row.vehicleLabel ?? ''}
                        disabled={pending}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (row.vehicleLabel ?? '').trim()) void updateFields(row, { vehicleLabel: v || null });
                        }}
                        className='mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white'
                        placeholder='e.g. Tesla Model S'
                      />
                    </label>

                    <label className='block text-[9px] font-black uppercase text-zinc-500'>
                      Service Label
                      <input
                        key={`${row.id}-service`}
                        defaultValue={row.serviceLabel ?? ''}
                        disabled={pending}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (row.serviceLabel ?? '').trim()) void updateFields(row, { serviceLabel: v || null });
                        }}
                        className='mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white'
                        placeholder='e.g. Paint Correction'
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className='block text-[9px] font-black uppercase text-zinc-500'>
                        Phase
                        <select
                          key={`${row.id}-phase`}
                          defaultValue={row.transformationPhase ?? ''}
                          disabled={pending}
                          onChange={(e) => {
                            const v = e.target.value || null;
                            void updateFields(row, { transformationPhase: v });
                          }}
                          className='mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white'
                        >
                          <option value="">None</option>
                          <option value="before">Before</option>
                          <option value="after">After</option>
                          <option value="before_after">Before/After Pair</option>
                        </select>
                      </label>

                      <label className="flex flex-col justify-end text-[9px] font-black uppercase text-zinc-500 cursor-pointer">
                        <span className="mb-2.5">Watermark</span>
                        <div className="flex items-center h-8">
                          <input
                            type="checkbox"
                            defaultChecked={row.watermark}
                            onChange={(e) => {
                              void updateFields(row, { watermark: e.target.checked });
                            }}
                            className="h-4 w-4 rounded border-white/10 text-gold focus:ring-0"
                          />
                        </div>
                      </label>
                    </div>

                    <div className='flex flex-wrap gap-1 pt-1.5 border-t border-white/5'>
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${row.published ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700 text-zinc-400'}`}>
                        {row.published ? 'Published' : 'Draft'}
                      </span>
                      {row.featured ? (
                        <span className='rounded bg-gold/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gold-soft'>Featured</span>
                      ) : null}
                      {row.watermark ? (
                        <span className='rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-blue-300'>Watermarked</span>
                      ) : null}
                    </div>

                    <div className='flex flex-wrap gap-1 pt-1'>
                      <button
                        type='button'
                        disabled={pending}
                        onClick={() => void togglePublished(row)}
                        className='rounded border border-gold/40 px-2 py-1 text-[10px] font-bold uppercase text-gold-soft disabled:opacity-40 hover:bg-gold/10'
                      >
                        {row.published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        type='button'
                        disabled={pending}
                        onClick={() => void toggleFeatured(row)}
                        className='rounded border border-white/20 px-2 py-1 text-[10px] font-bold uppercase text-zinc-200 disabled:opacity-40 hover:bg-white/5'
                      >
                        {row.featured ? 'Unfeature' : 'Feature'}
                      </button>
                      <button
                        type='button'
                        disabled={pending}
                        onClick={() => void remove(row)}
                        className='rounded border border-red-500/40 px-2 py-1 text-[10px] font-bold uppercase text-red-300 disabled:opacity-40 hover:bg-red-500/10'
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      
      <button
        type='button'
        disabled={saving}
        onClick={() => void saveOrder()}
        className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
      >
        {saving ? 'Saving…' : 'Save gallery order'}
      </button>
      {feedback ? (
        <p
          role={feedback.kind === 'err' ? 'alert' : 'status'}
          className={`text-sm font-medium ${feedback.kind === 'err' ? 'text-rose-300' : 'text-emerald-300'}`}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}

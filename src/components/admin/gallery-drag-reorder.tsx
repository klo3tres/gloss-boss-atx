'use client';

import { useCallback, useState } from 'react';
import { reorderGalleryBulkAction } from '@/app/(dashboard)/admin/gallery-messages-actions';

export type GalleryDragItem = {
  id: string;
  caption: string | null;
  url: string;
  sort_order: number;
};

export function GalleryDragReorder({ rows }: { rows: GalleryDragItem[] }) {
  const [items, setItems] = useState(rows);
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onDragStart = (id: string) => setDragId(id);

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
      return next;
    });
  };

  const saveOrder = useCallback(async () => {
    setSaving(true);
    setMsg(null);
    const fd = new FormData();
    fd.set('order', items.map((x) => x.id).join(','));
    try {
      await reorderGalleryBulkAction(fd);
      setMsg('Order saved.');
    } catch {
      setMsg('Could not save order.');
    } finally {
      setSaving(false);
    }
  }, [items]);

  if (items.length === 0) return <p className='text-sm text-zinc-500'>No gallery rows yet.</p>;

  return (
    <div className='mt-4 space-y-3'>
      <p className='text-xs text-zinc-500'>Drag rows to reorder, then save. Uses <code className='text-gold-soft'>sort_order</code>.</p>
      <ul className='space-y-2'>
        {items.map((row) => (
          <li
            key={row.id}
            draggable
            onDragStart={() => onDragStart(row.id)}
            onDragOver={(e) => onDragOver(e, row.id)}
            onDragEnd={() => setDragId(null)}
            className='flex cursor-grab items-center gap-3 rounded-lg border border-white/10 bg-black/40 p-3 active:cursor-grabbing'
          >
            <span className='text-xs text-zinc-600'>⋮⋮</span>
            <div className='min-w-0 flex-1'>
              <p className='text-xs text-zinc-500'>order {row.sort_order}</p>
              <p className='truncate text-sm text-gold-soft'>{row.url}</p>
              {row.caption ? <p className='text-xs text-zinc-400'>{row.caption}</p> : null}
            </div>
          </li>
        ))}
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

'use client';

import { ChevronLeft, ChevronRight, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export type LightboxPhoto = {
  id: string;
  url: string;
  label?: string;
  caption?: string;
  createdAt?: string;
  table?: 'job_media' | 'job_photos';
  storagePath?: string;
  storageBucket?: string;
};

export function PhotoLightboxModal({
  photos,
  initialIndex = 0,
  open,
  onClose,
  canDelete = false,
  onDelete,
}: {
  photos: LightboxPhoto[];
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
  canDelete?: boolean;
  onDelete?: (photo: LightboxPhoto) => Promise<void>;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (open) {
      setIndex(initialIndex);
      setZoom(1);
    }
  }, [open, initialIndex]);

  const photo = photos[index];
  const go = useCallback(
    (delta: number) => {
      if (photos.length < 2) return;
      setIndex((i) => (i + delta + photos.length) % photos.length);
      setZoom(1);
    },
    [photos.length],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose, go]);

  if (!open || !photo) return null;

  return (
    <div
      className='fixed inset-0 z-[200] flex flex-col bg-black/95 backdrop-blur-sm'
      role='dialog'
      aria-modal='true'
      aria-label={photo.label ?? 'Photo preview'}
    >
      <div className='flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3'>
        <div className='min-w-0'>
          <p className='truncate text-sm font-black uppercase tracking-wider text-gold-soft'>{photo.label ?? 'Photo'}</p>
          {photo.caption ? <p className='truncate text-xs text-zinc-400'>{photo.caption}</p> : null}
          {photo.createdAt ? <p className='text-[10px] text-zinc-500'>{photo.createdAt}</p> : null}
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          <button
            type='button'
            onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
            className='rounded-lg border border-white/15 p-2 text-zinc-300'
            aria-label='Zoom out'
          >
            <ZoomOut className='h-4 w-4' />
          </button>
          <button
            type='button'
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            className='rounded-lg border border-white/15 p-2 text-zinc-300'
            aria-label='Zoom in'
          >
            <ZoomIn className='h-4 w-4' />
          </button>
          {canDelete && onDelete ? (
            <button
              type='button'
              onClick={() => void onDelete(photo)}
              className='rounded-lg border border-red-500/40 p-2 text-red-200'
              aria-label='Delete photo'
            >
              <Trash2 className='h-4 w-4' />
            </button>
          ) : null}
          <button type='button' onClick={onClose} className='rounded-lg border border-gold/40 p-2 text-gold-soft' aria-label='Close'>
            <X className='h-5 w-5' />
          </button>
        </div>
      </div>

      <div className='relative flex flex-1 items-center justify-center overflow-hidden p-4'>
        {photos.length > 1 ? (
          <button
            type='button'
            onClick={() => go(-1)}
            className='absolute left-2 z-10 rounded-full border border-white/20 bg-black/60 p-3 text-white sm:left-4'
            aria-label='Previous'
          >
            <ChevronLeft className='h-6 w-6' />
          </button>
        ) : null}
        <img
          src={photo.url}
          alt={photo.label ?? 'Job photo'}
          className='max-h-[min(78vh,900px)] max-w-full object-contain transition-transform duration-200'
          style={{ transform: `scale(${zoom})` }}
        />
        {photos.length > 1 ? (
          <button
            type='button'
            onClick={() => go(1)}
            className='absolute right-2 z-10 rounded-full border border-white/20 bg-black/60 p-3 text-white sm:right-4'
            aria-label='Next'
          >
            <ChevronRight className='h-6 w-6' />
          </button>
        ) : null}
      </div>

      {photos.length > 1 ? (
        <p className='pb-4 text-center text-xs text-zinc-500'>
          {index + 1} / {photos.length}
        </p>
      ) : null}
    </div>
  );
}

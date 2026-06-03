'use client';

import type { ReactNode } from 'react';

export function AdminMetricDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className='fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-4 sm:items-center' role='dialog' aria-modal='true'>
      <div className='max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-gold/30 bg-zinc-950 shadow-[0_0_60px_rgba(212,175,55,0.12)]'>
        <div className='flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4'>
          <div>
            <h2 className='text-lg font-black uppercase tracking-tight text-white'>{title}</h2>
            {subtitle ? <p className='mt-1 text-xs text-zinc-400'>{subtitle}</p> : null}
          </div>
          <button
            type='button'
            onClick={onClose}
            className='shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300 hover:border-gold/40 hover:text-gold-soft'
          >
            Close
          </button>
        </div>
        <div className='max-h-[calc(88vh-4.5rem)] overflow-y-auto p-5'>{children}</div>
      </div>
    </div>
  );
}

export function AdminEmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className='rounded-2xl border border-dashed border-white/15 bg-black/40 px-6 py-10 text-center'>
      <p className='text-sm font-bold text-zinc-300'>{title}</p>
      <p className='mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-500'>{detail}</p>
    </div>
  );
}

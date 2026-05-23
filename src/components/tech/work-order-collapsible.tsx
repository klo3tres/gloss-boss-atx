'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function WorkOrderCollapsible({
  title,
  defaultOpen = false,
  children,
  badge,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className='rounded-2xl border border-white/10 bg-zinc-950/80 overflow-hidden'>
      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        className='flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03]'
      >
        <span className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>{title}</span>
        <span className='flex items-center gap-2'>
          {badge ? <span className='rounded-full border border-gold/30 px-2 py-0.5 text-[10px] text-zinc-400'>{badge}</span> : null}
          <ChevronDown className={`h-4 w-4 text-zinc-500 transition ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open ? <div className='border-t border-white/10 px-4 py-4'>{children}</div> : null}
    </section>
  );
}

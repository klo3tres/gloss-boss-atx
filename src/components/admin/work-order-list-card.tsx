'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

export function WorkOrderListCard({
  title,
  meta,
  amountBadge,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  meta: React.ReactNode;
  amountBadge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <article className='rounded-xl border border-white/10 bg-black/35 text-sm overflow-hidden'>
      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        className='flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-white/[0.02]'
      >
        <div className='min-w-0 flex-1'>
          <div className='font-semibold text-white'>{title}</div>
          <div className='mt-1 text-xs text-zinc-500'>{meta}</div>
        </div>
        <span className='flex shrink-0 items-center gap-2'>
          {amountBadge}
          <ChevronDown className={`h-4 w-4 text-zinc-500 transition ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open ? <div className='border-t border-white/10 px-4 pb-4 pt-2'>{children}</div> : null}
    </article>
  );
}

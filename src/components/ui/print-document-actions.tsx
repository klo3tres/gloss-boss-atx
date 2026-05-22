'use client';

import { PrintButton } from '@/components/ui/print-button';

export function PrintDocumentActions({ sendForm }: { sendForm?: React.ReactNode }) {
  return (
    <div className='gb-no-print mb-4 flex flex-wrap gap-2'>
      <PrintButton className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Print Receipt</PrintButton>
      <PrintButton className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>Download PDF</PrintButton>
      {sendForm}
    </div>
  );
}

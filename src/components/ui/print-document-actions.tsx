'use client';

import Link from 'next/link';
import { PrintButton } from '@/components/ui/print-button';

export function PrintDocumentActions({
  sendForm,
  variant = 'receipt',
  pdfHref,
}: {
  sendForm?: React.ReactNode;
  variant?: 'receipt' | 'agreement';
  pdfHref?: string;
}) {
  const label = variant === 'agreement' ? 'Agreement' : 'Receipt';
  return (
    <div className='gb-no-print mb-4 flex flex-wrap gap-2'>
      <PrintButton className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Print {label}</PrintButton>
      {pdfHref ? (
        <Link
          href={pdfHref}
          target='_blank'
          rel='noopener noreferrer'
          className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300 hover:border-gold/40 hover:text-gold-soft'
        >
          Download PDF
        </Link>
      ) : (
        <PrintButton className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>Download PDF</PrintButton>
      )}
      {sendForm}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';

export function ReceiptPdfDownloadButton({
  href,
  className = '',
  label = 'Download invoice PDF',
}: {
  href: string;
  className?: string;
  label?: string;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [message, setMessage] = useState('');

  async function onClick() {
    setState('loading');
    setMessage('');
    try {
      const res = await fetch(href, { credentials: 'include' });
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok) {
        let err = 'Could not load invoice PDF.';
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) err = j.error;
        } catch {
          /* ignore */
        }
        setState('err');
        setMessage(err);
        return;
      }
      if (!contentType.includes('pdf')) {
        setState('err');
        setMessage('Server did not return a PDF. Generate a receipt from the work order first.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cd = res.headers.get('content-disposition') ?? '';
      const match = /filename="?([^";]+)"?/i.exec(cd);
      a.href = url;
      a.download = match?.[1] ?? 'gloss-boss-invoice.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState('ok');
      setMessage('PDF downloaded.');
      window.setTimeout(() => {
        setState('idle');
        setMessage('');
      }, 4000);
    } catch {
      setState('err');
      setMessage('Network error while downloading PDF.');
    }
  }

  return (
    <div className={className}>
      <button
        type='button'
        onClick={onClick}
        disabled={state === 'loading'}
        className='flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 px-4 py-3 text-xs font-black uppercase text-zinc-200 disabled:opacity-50'
      >
        <Download className='h-4 w-4' aria-hidden />
        {state === 'loading' ? 'Preparing PDF…' : label}
      </button>
      {message ? (
        <p
          className={`mt-2 text-center text-[10px] ${state === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}
          role={state === 'err' ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

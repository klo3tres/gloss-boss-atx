'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FileText, X } from 'lucide-react';

type ReceiptDrawerRow = {
  id: string;
  receiptNumber: string;
  customer: string;
  email?: string;
  phone?: string;
  workOrderId?: string;
  paymentId?: string;
  amount: string;
  balance: string;
  status: string;
  sentStatus?: string;
  lineItems?: string[];
  discounts?: string;
  pdfHref: string;
  receiptHref: string;
  paymentHref?: string;
};

export function ReceiptDetailDrawer({ row }: { row: ReceiptDrawerRow }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300 transition hover:border-gold/35 hover:text-white"
      >
        Review
      </button>
      {open ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} aria-label="Close receipt drawer" />
          <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-lg flex-col border-l border-white/10 bg-zinc-950 p-6 shadow-[0_0_56px_rgba(0,0,0,0.85)]">
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gold/25 bg-gold/10 text-gold-soft">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">{row.status}</p>
                  <h3 className="text-lg font-black text-white">{row.receiptNumber}</h3>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto py-5 text-sm">
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Customer</p>
                <p className="mt-1 font-black text-white">{row.customer}</p>
                <p className="mt-1 text-xs text-zinc-400">{[row.email, row.phone].filter(Boolean).join(' · ') || 'No contact on file'}</p>
              </section>
              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <p className="text-[10px] font-black uppercase text-zinc-500">Paid / invoiced</p>
                  <p className="mt-1 font-mono text-lg font-black text-gold-soft">{row.amount}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <p className="text-[10px] font-black uppercase text-zinc-500">Balance due</p>
                  <p className="mt-1 font-mono text-lg font-black text-white">{row.balance}</p>
                </div>
              </section>
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Line items</p>
                <ul className="mt-3 space-y-2 text-xs text-zinc-300">
                  {(row.lineItems?.length ? row.lineItems : ['Service package and recorded payments']).map((item) => (
                    <li key={item} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">{item}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-zinc-500">Credits / discounts: {row.discounts || 'None recorded'}</p>
                <p className="mt-1 text-xs text-zinc-500">Send status: {row.sentStatus || 'Draft / review needed'}</p>
              </section>
              <section className="grid gap-2 text-xs">
                <Link href={row.receiptHref} className="rounded-xl bg-gold px-4 py-3 text-center font-black uppercase text-black">Open receipt file</Link>
                <Link href={row.pdfHref} className="rounded-xl border border-white/15 px-4 py-3 text-center font-black uppercase text-zinc-200">Download PDF</Link>
                {row.paymentHref ? <Link href={row.paymentHref} className="rounded-xl border border-white/15 px-4 py-3 text-center font-black uppercase text-zinc-200">Linked payment</Link> : null}
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

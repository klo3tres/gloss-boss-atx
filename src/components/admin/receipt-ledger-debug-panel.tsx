'use client';



import { formatTotalsRow, type ReceiptParityDebug } from '@/lib/receipt-totals';



function TotalsTable({ title, row }: { title: string; row: ReturnType<typeof formatTotalsRow> }) {

  return (

    <div className='rounded-lg border border-white/10 bg-black/40 p-3'>

      <p className='text-[10px] font-black uppercase tracking-wider text-zinc-400'>{title}</p>

      <dl className='mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs'>

        <dt className='text-zinc-500'>Subtotal</dt>

        <dd className='font-mono text-right text-zinc-200'>{row.grossSubtotal}</dd>

        <dt className='text-zinc-500'>Discounts</dt>

        <dd className='font-mono text-right text-zinc-200'>{row.totalDiscounts}</dd>

        <dt className='text-zinc-500'>Final</dt>

        <dd className='font-mono text-right text-white'>{row.finalTotal}</dd>

        <dt className='text-zinc-500'>Paid</dt>

        <dd className='font-mono text-right text-emerald-200'>{row.totalPaid}</dd>

        <dt className='text-zinc-500'>Balance</dt>

        <dd className='font-mono text-right text-gold-soft'>{row.balanceDue}</dd>

      </dl>

    </div>

  );

}



export function ReceiptLedgerDebugPanel({ parity }: { parity: ReceiptParityDebug }) {

  const ledger = formatTotalsRow(parity.ledger);

  const view = formatTotalsRow(parity.receiptView);

  const pdf = formatTotalsRow(parity.pdf);

  const email = formatTotalsRow(parity.email);



  return (

    <section

      className={`gb-no-print mb-6 rounded-2xl border p-4 ${

        parity.allMatch ? 'border-violet-500/35 bg-violet-950/30' : 'border-red-500/50 bg-red-950/25'

      }`}

    >

      <p className='text-xs font-black uppercase tracking-[0.22em] text-violet-200'>Admin — receipt totals parity</p>

      <p className='mt-1 text-[11px] text-zinc-400'>

        Ledger, on-screen receipt, PDF input, and email must match on subtotal, discounts, final, paid, and balance before

        sending to customers.

      </p>

      {parity.allMatch ? (

        <p className='mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100'>

          All totals match.

        </p>

      ) : (

        <div className='mt-2 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2'>

          <p className='text-xs font-bold text-red-100'>Totals mismatch — do not email customer until fixed.</p>

          <ul className='mt-2 list-inside list-disc text-xs text-red-200'>

            {parity.mismatches.map((m) => (

              <li key={m}>{m}</li>

            ))}

          </ul>

        </div>

      )}

      <div className='mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>

        <TotalsTable title='Ledger' row={ledger} />

        <TotalsTable title='Receipt view' row={view} />

        <TotalsTable title='PDF' row={pdf} />

        <TotalsTable title='Email' row={email} />

      </div>

    </section>

  );

}



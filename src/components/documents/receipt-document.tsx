import Image from 'next/image';
import { GLOSS_BOSS_BRAND_NAME, GLOSS_BOSS_SUPPORT_EMAIL, GLOSS_BOSS_SUPPORT_MAILTO } from '@/lib/branding';
import { PremiumBadge } from '@/components/ui/premium';
import type { ReceiptBreakdownLine } from '@/lib/receipt-breakdown';

export type ReceiptDocumentVehicle = {
  name: string;
  service: string;
  color: string;
  price: string;
};

export type ReceiptDocumentProps = {
  receiptNumber: string;
  paidAt: string;
  serviceAt?: string;
  completedAt?: string;
  serviceDuration?: string;
  technicianName?: string;
  method: string;
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceAddress: string;
  vehicles: ReceiptDocumentVehicle[];
  breakdownLines?: ReceiptBreakdownLine[];
  baseTotal: string;
  addOnSubtotal?: string;
  onlineDiscount: string;
  multiCarDiscount: string;
  promoLabel: string;
  promoDiscount: string;
  manualDiscount?: string;
  depositPaid: string;
  cashPaid: string;
  stripePaid?: string;
  fullPaid: string;
  remainingBalance: string;
  taxAmount?: string;
  finalTotal: string;
  stripeSession: string;
  stripePaymentIntent: string;
  paymentRowId: string;
};

export function ReceiptDocument(props: ReceiptDocumentProps) {
  const paid = ['paid', 'succeeded', 'full_paid', 'comped'].some((s) => props.status.toLowerCase().includes(s));

  return (
    <article className='gb-print-document mx-auto max-w-4xl overflow-hidden rounded-3xl border border-gold/25 bg-white text-zinc-900 shadow-[0_0_60px_rgba(212,175,55,0.15)] print:shadow-none'>
      <header className='border-b-4 border-gold bg-gradient-to-r from-black via-zinc-900 to-black px-8 py-8 text-white print:bg-black'>
        <div className='flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-center gap-5'>
            <Image src='/branding/gloss-boss-atx-logo.png' alt={GLOSS_BOSS_BRAND_NAME} width={140} height={70} className='h-auto w-32' unoptimized />
            <div>
              <p className='text-xs font-black uppercase tracking-[0.35em] text-gold-soft'>Invoice</p>
              <h1 className='text-2xl font-black'>{GLOSS_BOSS_BRAND_NAME}</h1>
              <p className='text-sm text-zinc-400'>Luxury mobile detailing · Austin, TX</p>
            </div>
          </div>
          <div className='text-right'>
            <p className='font-mono text-2xl font-black text-gold-soft'>{props.receiptNumber}</p>
            <PremiumBadge tone={paid ? 'emerald' : 'amber'}>{paid ? 'Paid in full' : props.status}</PremiumBadge>
          </div>
        </div>
      </header>

      <div className='grid gap-0 border-b border-zinc-200 sm:grid-cols-2'>
        <section className='border-b border-zinc-200 p-6 sm:border-b-0 sm:border-r'>
          <p className='text-[10px] font-black uppercase tracking-widest text-zinc-500'>Bill to</p>
          <p className='mt-2 text-lg font-bold'>{props.customerName}</p>
          <p className='text-sm text-zinc-600'>{props.customerEmail}</p>
          <p className='text-sm text-zinc-600'>{props.customerPhone}</p>
          <p className='mt-3 text-sm text-zinc-700'>{props.serviceAddress}</p>
        </section>
        <section className='p-6'>
          <dl className='space-y-2 text-sm'>
            <div className='flex justify-between gap-4'>
              <dt className='text-zinc-500'>Paid</dt>
              <dd className='font-semibold'>{props.paidAt}</dd>
            </div>
            {props.serviceAt ? (
              <div className='flex justify-between gap-4'>
                <dt className='text-zinc-500'>Service</dt>
                <dd>{props.serviceAt}</dd>
              </div>
            ) : null}
            {props.completedAt ? (
              <div className='flex justify-between gap-4'>
                <dt className='text-zinc-500'>Completed</dt>
                <dd>{props.completedAt}</dd>
              </div>
            ) : null}
            {props.serviceDuration ? (
              <div className='flex justify-between gap-4'>
                <dt className='text-zinc-500'>Duration</dt>
                <dd>{props.serviceDuration}</dd>
              </div>
            ) : null}
            {props.technicianName ? (
              <div className='flex justify-between gap-4'>
                <dt className='text-zinc-500'>Technician</dt>
                <dd>{props.technicianName}</dd>
              </div>
            ) : null}
            <div className='flex justify-between gap-4'>
              <dt className='text-zinc-500'>Method</dt>
              <dd>{props.method}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className='p-6'>
        <table className='gb-invoice-table w-full text-sm'>
          <thead>
            <tr className='border-b-2 border-zinc-800 text-left text-[10px] font-black uppercase tracking-wider'>
              <th>Vehicle / service</th>
              <th>Details</th>
              <th className='text-right'>Amount</th>
            </tr>
          </thead>
          <tbody>
            {props.vehicles.map((v, i) => (
              <tr key={i} className='border-b border-zinc-200'>
                <td className='font-semibold'>{v.name}</td>
                <td className='text-zinc-600'>
                  {v.service} · {v.color}
                </td>
                <td className='text-right font-mono'>{v.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className='border-t border-zinc-200 bg-zinc-50 p-6'>
        <div className='ml-auto max-w-sm space-y-2 text-sm'>
          {props.breakdownLines && props.breakdownLines.length > 0 ? (
            props.breakdownLines.map((line, i) => (
              <div
                key={`${line.label}-${i}`}
                className={`flex justify-between gap-4 ${
                  line.tone === 'total' ? 'border-t border-zinc-300 pt-3 text-lg font-black' : line.tone === 'discount' ? 'text-emerald-800' : ''
                }`}
              >
                <span className={line.tone === 'total' ? '' : 'text-zinc-600'}>{line.label}</span>
                <span className={`font-mono shrink-0 ${line.tone === 'total' ? 'text-gold' : ''}`}>{line.amount}</span>
              </div>
            ))
          ) : (
            <>
              <div className='flex justify-between'>
                <span>Base services subtotal</span>
                <span className='font-mono'>{props.baseTotal}</span>
              </div>
              {props.addOnSubtotal && props.addOnSubtotal !== '$0.00' ? (
                <div className='flex justify-between text-zinc-600'>
                  <span>Add-ons subtotal</span>
                  <span className='font-mono'>{props.addOnSubtotal}</span>
                </div>
              ) : null}
              <div className='flex justify-between text-zinc-600'>
                <span>Online booking discount</span>
                <span className='font-mono'>{props.onlineDiscount}</span>
              </div>
              <div className='flex justify-between text-zinc-600'>
                <span>Multi-car discount</span>
                <span className='font-mono'>{props.multiCarDiscount}</span>
              </div>
              <div className='flex justify-between text-zinc-600'>
                <span>{props.promoLabel}</span>
                <span className='font-mono'>{props.promoDiscount}</span>
              </div>
              {props.manualDiscount && props.manualDiscount !== '$0.00' ? (
                <div className='flex justify-between text-emerald-800'>
                  <span>Manual discount</span>
                  <span className='font-mono'>{props.manualDiscount}</span>
                </div>
              ) : null}
              {props.taxAmount ? (
                <div className='flex justify-between text-zinc-600'>
                  <span>Tax</span>
                  <span className='font-mono'>{props.taxAmount}</span>
                </div>
              ) : null}
              <div className='flex justify-between border-t border-zinc-300 pt-3 text-lg font-black'>
                <span>Final total</span>
                <span className='font-mono text-gold'>{props.finalTotal}</span>
              </div>
              <div className='flex justify-between text-zinc-600'>
                <span>Deposit paid</span>
                <span className='font-mono'>{props.depositPaid}</span>
              </div>
              {props.stripePaid ? (
                <div className='flex justify-between text-zinc-600'>
                  <span>Stripe paid</span>
                  <span className='font-mono'>{props.stripePaid}</span>
                </div>
              ) : null}
              <div className='flex justify-between text-zinc-600'>
                <span>Cash paid</span>
                <span className='font-mono'>{props.cashPaid}</span>
              </div>
              <div className='flex justify-between font-semibold text-zinc-700'>
                <span>Total paid</span>
                <span className='font-mono'>{props.fullPaid}</span>
              </div>
              <div className='flex justify-between font-semibold'>
                <span>Balance due</span>
                <span className='font-mono'>{props.remainingBalance}</span>
              </div>
            </>
          )}
        </div>
      </section>

      <footer className='border-t border-zinc-200 px-6 py-4 text-center text-xs text-zinc-500'>
        <p>
          <a href={GLOSS_BOSS_SUPPORT_MAILTO} className='font-semibold text-zinc-800 underline decoration-gold/50'>
            {GLOSS_BOSS_SUPPORT_EMAIL}
          </a>
          {' · '}
          Stripe {props.stripePaymentIntent !== 'Not provided' ? props.stripePaymentIntent.slice(0, 20) + '…' : '—'}
        </p>
        <p className='mt-1 font-mono'>Payment ref {props.paymentRowId}</p>
      </footer>
    </article>
  );
}

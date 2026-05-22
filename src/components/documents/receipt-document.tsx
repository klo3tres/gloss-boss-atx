import Image from 'next/image';
import { GLOSS_BOSS_BRAND_NAME, GLOSS_BOSS_LOGO_URL, GLOSS_BOSS_SUPPORT_EMAIL } from '@/lib/branding';

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
  method: string;
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceAddress: string;
  vehicles: ReceiptDocumentVehicle[];
  baseTotal: string;
  onlineDiscount: string;
  multiCarDiscount: string;
  promoLabel: string;
  promoDiscount: string;
  depositPaid: string;
  cashPaid: string;
  fullPaid: string;
  remainingBalance: string;
  finalTotal: string;
  stripeSession: string;
  stripePaymentIntent: string;
  paymentRowId: string;
};

export function ReceiptDocument(props: ReceiptDocumentProps) {
  return (
    <article className='gb-print-document mx-auto max-w-4xl rounded-3xl border border-gold/30 bg-zinc-950 p-6 text-white shadow-[0_0_50px_rgba(212,166,77,0.12)] print:max-w-none print:rounded-none print:border-zinc-300 print:bg-white print:text-black print:shadow-none'>
      <header className='flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between print:border-zinc-300'>
        <div className='flex items-start gap-4'>
          <Image src='/branding/gloss-boss-atx-logo.png' alt={GLOSS_BOSS_BRAND_NAME} width={160} height={80} className='h-auto w-36 print:w-32' unoptimized />
          <div>
            <p className='text-xs font-black uppercase tracking-[0.35em] text-gold-soft print:text-black'>{GLOSS_BOSS_BRAND_NAME}</p>
            <h1 className='mt-2 text-3xl font-black uppercase text-white print:text-black'>Receipt</h1>
            <p className='mt-1 text-sm text-zinc-400 print:text-zinc-700'>Luxury mobile detailing · Austin, TX</p>
            <p className='mt-1 text-xs text-zinc-500 print:text-zinc-600'>{GLOSS_BOSS_SUPPORT_EMAIL}</p>
          </div>
        </div>
        <div className='sm:text-right'>
          <p className='font-mono text-lg font-black text-white print:text-black'>{props.receiptNumber}</p>
          <p className='text-sm text-zinc-400 print:text-zinc-700'>Paid {props.paidAt}</p>
          {props.serviceAt ? <p className='text-sm text-zinc-400 print:text-zinc-700'>Service {props.serviceAt}</p> : null}
          {props.completedAt ? <p className='text-sm text-zinc-400 print:text-zinc-700'>Completed {props.completedAt}</p> : null}
          <p className='text-sm text-zinc-400 print:text-zinc-700'>
            {props.method} · {props.status}
          </p>
        </div>
      </header>

      <div className='mt-6 grid gap-4 md:grid-cols-2'>
        <section className='rounded-2xl border border-white/10 bg-black/30 p-4 print:border-zinc-300 print:bg-white'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft print:text-black'>Customer</p>
          <p className='mt-2 text-lg font-bold text-white print:text-black'>{props.customerName}</p>
          <p className='text-sm text-zinc-400 print:text-zinc-700'>{props.customerEmail}</p>
          <p className='text-sm text-zinc-400 print:text-zinc-700'>{props.customerPhone}</p>
          <p className='mt-2 text-sm text-zinc-300 print:text-zinc-700'>{props.serviceAddress}</p>
        </section>
        <section className='rounded-2xl border border-white/10 bg-black/30 p-4 print:border-zinc-300 print:bg-white'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft print:text-black'>Payment IDs</p>
          <p className='mt-2 break-all font-mono text-xs text-zinc-300 print:text-zinc-700'>Stripe session: {props.stripeSession}</p>
          <p className='mt-1 break-all font-mono text-xs text-zinc-300 print:text-zinc-700'>Payment intent: {props.stripePaymentIntent}</p>
          <p className='mt-1 break-all font-mono text-xs text-zinc-300 print:text-zinc-700'>Payment row: {props.paymentRowId}</p>
        </section>
      </div>

      <section className='mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 print:border-zinc-300 print:bg-white'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft print:text-black'>Vehicles / Services</p>
        <div className='mt-3 grid gap-3'>
          {props.vehicles.map((v, i) => (
            <div key={`${v.name}-${i}`} className='rounded-xl border border-white/10 bg-black/30 p-3 print:border-zinc-300 print:bg-white'>
              <p className='font-bold text-white print:text-black'>
                Vehicle {i + 1}: {v.name}
              </p>
              <p className='text-sm text-zinc-400 print:text-zinc-700'>
                {v.color} · {v.service} · {v.price}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className='mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 print:border-zinc-300 print:bg-white'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft print:text-black'>Pricing Breakdown</p>
        <div className='mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2 print:text-zinc-800'>
          <p>
            Base total: <strong>{props.baseTotal}</strong>
          </p>
          <p>
            Online booking discount: <strong>{props.onlineDiscount}</strong>
          </p>
          <p>
            Multi-car discount: <strong>{props.multiCarDiscount}</strong>
          </p>
          <p>
            Promo / offer: <strong>{props.promoLabel}</strong>
          </p>
          <p>
            Offer discount: <strong>{props.promoDiscount}</strong>
          </p>
          <p>
            Deposit paid: <strong>{props.depositPaid}</strong>
          </p>
          <p>
            Cash paid: <strong>{props.cashPaid}</strong>
          </p>
          <p>
            Full paid: <strong>{props.fullPaid}</strong>
          </p>
          <p>
            Remaining balance: <strong>{props.remainingBalance}</strong>
          </p>
          <p className='text-lg text-white sm:col-span-2 print:text-black'>
            Final total: <strong>{props.finalTotal}</strong>
          </p>
        </div>
      </section>
    </article>
  );
}

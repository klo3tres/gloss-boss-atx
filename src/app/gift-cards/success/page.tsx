import Link from 'next/link';
import { MarketingSiteFooter } from '@/components/marketing/marketing-site-footer';

export default function GiftCardSuccessPage() {
  return (
    <main className='gb-luxury-page min-h-screen bg-background text-foreground'>
      <div className='mx-auto max-w-xl px-4 py-24 text-center sm:px-8'>
        <div className='gb-premium-hero rounded-3xl px-6 py-12'>
          <p className='text-xs font-black uppercase tracking-[0.3em] text-gold-soft'>Gloss Boss ATX</p>
          <h1 className='mt-4 text-3xl font-black uppercase sm:text-4xl'>Gift card confirmed</h1>
          <p className='mt-4 text-sm leading-relaxed text-zinc-300'>
            Your purchase was processed through Stripe. Keep your receipt email — the balance applies toward any mobile detailing service when you book.
          </p>
          <dl className='mt-8 space-y-2 rounded-2xl border border-white/10 bg-black/40 p-4 text-left text-sm'>
            <div className='flex justify-between gap-4'>
              <dt className='text-zinc-500'>Next step</dt>
              <dd className='font-bold text-gold-soft'>Book online</dd>
            </div>
            <div className='flex justify-between gap-4'>
              <dt className='text-zinc-500'>Questions</dt>
              <dd>
                <a href='mailto:info@glossbossatx.com' className='text-gold-soft underline'>
                  info@glossbossatx.com
                </a>
              </dd>
            </div>
          </dl>
          <div className='mt-8 flex flex-wrap justify-center gap-3'>
            <Link href='/book' className='rounded-xl bg-gold px-6 py-3 text-sm font-black uppercase tracking-wider text-black'>
              Book a service
            </Link>
            <Link href='/' className='rounded-xl border border-white/20 px-6 py-3 text-sm font-black uppercase tracking-wider text-white'>
              Home
            </Link>
          </div>
        </div>
      </div>
      <MarketingSiteFooter />
    </main>
  );
}

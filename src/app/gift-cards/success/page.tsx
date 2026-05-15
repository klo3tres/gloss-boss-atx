import Link from 'next/link';

export default function GiftCardSuccessPage() {
  return (
    <main className='flex min-h-screen flex-col items-center justify-center bg-background px-4 py-24 text-center text-foreground'>
      <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Gloss Boss ATX</p>
      <h1 className='mt-4 text-3xl font-black uppercase sm:text-4xl'>Thank you</h1>
      <p className='mt-4 max-w-lg text-sm text-zinc-300'>
        Your gift card purchase was submitted through Stripe. Keep your receipt email — our team will honor the balance toward any detailing service when you book.
      </p>
      <div className='mt-8 flex flex-wrap justify-center gap-3'>
        <Link href='/book' className='rounded-lg bg-gold px-6 py-3 text-sm font-bold uppercase tracking-wider text-black'>
          Book a service
        </Link>
        <Link href='/' className='rounded-lg border border-white/20 px-6 py-3 text-sm font-bold uppercase tracking-wider text-white'>
          Back home
        </Link>
      </div>
    </main>
  );
}

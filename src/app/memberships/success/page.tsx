import Link from 'next/link';

export default function MembershipSuccessPage() {
  return (
    <main className='gb-luxury-page min-h-screen bg-background px-4 py-28 text-foreground'>
      <section className='mx-auto max-w-xl rounded-3xl border border-gold/25 bg-zinc-950/90 p-8 text-center'>
        <p className='text-xs font-black uppercase tracking-[0.24em] text-gold-soft'>Membership activated</p>
        <h1 className='mt-3 text-3xl font-black uppercase text-white'>Welcome to Gloss Boss Memberships</h1>
        <p className='mt-3 text-sm text-zinc-300'>Your payment was received. Sign in to view membership status, book with member pricing, and track loyalty stamps.</p>
        <div className='mt-6 flex justify-center gap-3'>
          <Link href='/dashboard' className='rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black'>Customer dashboard</Link>
          <Link href='/book' className='rounded-xl border border-white/15 px-5 py-3 text-xs font-black uppercase text-white'>Book service</Link>
        </div>
      </section>
    </main>
  );
}

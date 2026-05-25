import { Suspense } from 'react';
import { BookingWizard } from '@/components/booking/booking-wizard';

export const metadata = {
  title: 'Book | Gloss Boss ATX',
};

export default function BookPage() {
  return (
    <main className='gb-luxury-page gb-booking-wizard min-h-screen px-4 py-24 text-foreground sm:px-6'>
      <div className='mx-auto w-full max-w-5xl'>
        <p className='gb-luxury-eyebrow'>Reserve your detail</p>
        <h1 className='gb-display-serif mt-2 text-3xl font-black uppercase tracking-tight sm:text-5xl'>
          Book <span className='text-gold'>Gloss Boss ATX</span>
        </h1>
        <p className='mt-4 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base'>
          Choose your package, reserve a time, pay your deposit, then sign the on-site liability agreement to confirm your appointment.
        </p>
        <div className='gb-premium-card mt-8 rounded-3xl border border-gold/20 p-6 sm:p-8'>
          <Suspense fallback={<p className='text-sm text-zinc-500'>Loading booking…</p>}>
            <BookingWizard />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

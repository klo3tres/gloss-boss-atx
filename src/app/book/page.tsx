import { Suspense } from 'react';
import { BookingWizard } from '@/components/booking/booking-wizard';

export const metadata = {
  title: 'Book | Gloss Boss ATX',
  description: 'Reserve your mobile detail in a few clear steps — vehicle, service, schedule, and secure deposit.',
};

export default function BookPage() {
  return (
    <main className='gb-luxury-page gb-booking-wizard min-h-screen overflow-x-hidden px-4 py-20 text-foreground sm:px-6 sm:py-24'>
      <div className='mx-auto w-full max-w-6xl min-w-0'>
        <p className='gb-luxury-eyebrow'>Reserve your detail</p>
        <h1 className='gb-display-serif mt-2 text-3xl font-black tracking-tight sm:text-5xl'>
          Book Your <span className='text-gold'>Detail</span>
        </h1>
        <p className='mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base'>
          Six quick steps — vehicle, service, add-ons, schedule, contact, and payment. Your total and time estimate update live as you go.
        </p>
        <div className='mt-8'>
          <Suspense fallback={<p className='text-sm text-zinc-500'>Loading booking…</p>}>
            <BookingWizard />
          </Suspense>
        </div>
        <p className='mt-8 text-center text-xs text-zinc-500'>
          By booking you agree to our{' '}
          <a href='/terms' className='text-gold-soft underline'>
            Terms
          </a>{' '}
          and{' '}
          <a href='/privacy' className='text-gold-soft underline'>
            Privacy Policy
          </a>
          . SMS updates require consent — reply STOP to opt out, HELP for support.
        </p>
      </div>
    </main>
  );
}

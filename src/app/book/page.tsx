import { BookingWizard } from '@/components/booking/booking-wizard';

export const metadata = {
  title: 'Book | Gloss Boss ATX',
};

export default function BookPage() {
  return (
    <main className='min-h-screen bg-background px-4 py-24 text-foreground sm:px-6'>
      <div className='mx-auto w-full max-w-5xl'>
        <h1 className='text-3xl font-black uppercase tracking-tight sm:text-5xl'>
          Book <span className='text-gold'>Gloss Boss ATX</span>
        </h1>
        <p className='mt-4 max-w-3xl text-sm text-zinc-300 sm:text-base'>
          Choose your package, reserve a time, pay your deposit, then sign the on-site liability agreement to confirm your appointment.
        </p>
        <div className='mt-8 rounded-2xl border border-gold/20 bg-zinc-950 p-6 sm:p-8'>
          <BookingWizard />
        </div>
      </div>
    </main>
  );
}

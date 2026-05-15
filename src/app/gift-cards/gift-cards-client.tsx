'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';

const giftCardTiers = [
  { name: 'Starter Shine', amountCents: 7500, useFor: 'Great for Exterior Wash' },
  { name: 'Interior Refresh', amountCents: 10000, useFor: 'Great for Interior Detail' },
  { name: 'Boss Level', amountCents: 20000, useFor: 'Great for Full Detail and upgrades' },
] as const;

export function GiftCardsClient({ checkoutAvailable }: { checkoutAvailable: boolean }) {
  const searchParams = useSearchParams();
  const cancelled = searchParams.get('cancelled');
  const [email, setEmail] = useState('');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = useCallback(
    async (amountCents: number, label: string) => {
      setError(null);
      if (!checkoutAvailable) {
        setError('Gift card checkout is not available yet.');
        return;
      }
      setBusy(label);
      try {
        const res = await fetch('/api/stripe/create-gift-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amountCents, email: email.trim() || null }),
        });
        const data = (await res.json()) as { url?: string; error?: string; message?: string; code?: string };
        if (data.url) {
          window.location.href = data.url;
          return;
        }
        if (!res.ok) {
          setError(data.message ?? data.error ?? 'Checkout could not start');
          setBusy(null);
          return;
        }
        setError(data.message ?? data.error ?? 'Stripe not connected yet — add keys under Admin → Stripe settings or environment variables.');
      } catch {
        setError('Network error');
      }
      setBusy(null);
    },
    [email, checkoutAvailable]
  );

  const customAmountCents = Math.round(Number(custom) * 100);
  const customValid = Number.isFinite(customAmountCents) && customAmountCents >= 1000 && customAmountCents <= 500_000;

  return (
    <main className='min-h-screen bg-background px-4 py-24 text-foreground sm:px-6'>
      <div className='mx-auto w-full max-w-5xl'>
        <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Gloss Boss ATX</p>
        <h1 className='mt-3 text-4xl font-black uppercase sm:text-5xl'>Gift cards</h1>
        <p className='mt-3 max-w-2xl text-zinc-300'>
          Purchase a digital gift card in seconds. You will be redirected to secure Stripe Checkout. Reference your Stripe receipt email when booking.
        </p>

        {cancelled ? (
          <p className='mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100'>Checkout was cancelled. You have not been charged.</p>
        ) : null}

        {!checkoutAvailable ? (
          <div
            className='mt-6 rounded-2xl border border-gold/30 bg-zinc-950/90 p-6 shadow-[0_0_28px_rgba(212,166,77,0.12)]'
            role='status'
          >
            <p className='text-xs font-bold uppercase tracking-[0.2em] text-gold-soft'>Gift cards</p>
            <h2 className='mt-2 text-xl font-black uppercase text-white'>Gift cards coming soon</h2>
            <p className='mt-2 text-sm text-zinc-400'>
              Online gift card checkout will appear here once Stripe is connected (environment variables or Admin → Stripe settings).
            </p>
          </div>
        ) : null}

        <label className='mt-8 block max-w-md text-sm'>
          <span className='mb-2 block text-zinc-300'>Purchaser email (optional)</span>
          <input
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3'
            placeholder='you@example.com'
          />
        </label>

        {error ? <p className='mt-4 text-sm text-red-400'>{error}</p> : null}

        <div className='mt-8 grid gap-4 md:grid-cols-2'>
          {giftCardTiers.map((tier) => (
            <article
              key={tier.name}
              className='rounded-2xl border border-gold/25 bg-zinc-950 p-5 shadow-[0_0_25px_rgba(212,166,77,0.08)] transition hover:border-gold/50 hover:shadow-[0_0_35px_rgba(212,166,77,0.18)]'
            >
              <h2 className='text-xl font-bold text-gold-soft'>{tier.name}</h2>
              <p className='mt-2 text-3xl font-black text-white'>${(tier.amountCents / 100).toFixed(0)}</p>
              <p className='mt-2 text-sm text-zinc-300'>{tier.useFor}</p>
              <button
                type='button'
                disabled={Boolean(busy) || !checkoutAvailable}
                onClick={() => startCheckout(tier.amountCents, tier.name)}
                className='mt-4 w-full rounded-lg bg-gold px-4 py-3 text-sm font-bold uppercase tracking-wider text-black transition hover:brightness-110 disabled:opacity-50'
              >
                {busy === tier.name ? 'Redirecting…' : 'Purchase gift card'}
              </button>
            </article>
          ))}
          <article className='rounded-2xl border border-gold/25 bg-zinc-950 p-5 md:col-span-2'>
            <h2 className='text-xl font-bold text-gold-soft'>Custom amount</h2>
            <p className='mt-2 text-sm text-zinc-400'>Between $10 and $5,000 USD.</p>
            <div className='mt-4 flex flex-col gap-3 sm:flex-row sm:items-end'>
              <label className='flex-1 text-sm'>
                <span className='mb-2 block text-zinc-300'>Amount (USD)</span>
                <input
                  type='number'
                  min={10}
                  max={5000}
                  step={1}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3'
                  placeholder='250'
                />
              </label>
              <button
                type='button'
                disabled={Boolean(busy) || !customValid || !checkoutAvailable}
                onClick={() => customValid && startCheckout(customAmountCents, 'custom')}
                className='rounded-lg border border-gold/50 px-6 py-3 text-sm font-bold uppercase tracking-wider text-gold-soft transition hover:bg-gold/10 disabled:opacity-40'
              >
                {busy === 'custom' ? 'Redirecting…' : 'Checkout custom amount'}
              </button>
            </div>
          </article>
        </div>

        <div className='mt-8 flex gap-3'>
          <Link href='/book' className='rounded-lg border border-gold/40 px-5 py-3 text-sm font-bold uppercase tracking-wider text-gold-soft'>
            Book a detail instead
          </Link>
          <Link href='/' className='rounded-lg border border-white/20 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white'>
            Back home
          </Link>
        </div>
      </div>
    </main>
  );
}

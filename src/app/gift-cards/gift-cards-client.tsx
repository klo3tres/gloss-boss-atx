'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { mediaUrl, type MediaRegistry } from '@/lib/media-registry';

const giftCardTiers = [
  { name: 'Starter Shine', amountCents: 7500, useFor: 'Great for Exterior Wash' },
  { name: 'Interior Refresh', amountCents: 10000, useFor: 'Great for Interior Detail' },
  { name: 'Boss Level', amountCents: 20000, useFor: 'Great for Full Detail and upgrades' },
] as const;

const occasions = [
  { id: 'birthday', label: 'Birthday', key: 'giftcards.birthday' },
  { id: 'graduation', label: 'Graduation', key: 'giftcards.graduation' },
  { id: 'fathers-day', label: "Father's Day", key: 'giftcards.fathersDay' },
  { id: 'mothers-day', label: "Mother's Day", key: 'giftcards.mothersDay' },
  { id: 'thank-you', label: 'Thank You', key: 'giftcards.thankYou' },
  { id: 'corporate', label: 'Corporate Reward', key: 'giftcards.corporate' },
  { id: 'holiday', label: 'Holiday', key: 'giftcards.holiday' },
  { id: 'new-car', label: 'New Car Gift', key: 'giftcards.newCar' },
];

export function GiftCardsClient({ checkoutAvailable }: { checkoutAvailable: boolean }) {
  const searchParams = useSearchParams();
  const cancelled = searchParams.get('cancelled');
  const [email, setEmail] = useState('');
  const [custom, setCustom] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [message, setMessage] = useState('');
  const [occasion, setOccasion] = useState(occasions[0]);
  const [giftMode, setGiftMode] = useState<'gift' | 'self'>('gift');
  const [mediaRegistry, setMediaRegistry] = useState<MediaRegistry>({});
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
          body: JSON.stringify({
            amountCents,
            email: email.trim() || null,
            recipientEmail: recipientEmail.trim() || null,
            deliveryDate: deliveryDate || null,
            message: message.trim() || null,
            occasion: occasion.label,
            sendAsGift: giftMode === 'gift',
          }),
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
    [deliveryDate, email, giftMode, message, occasion.label, recipientEmail, checkoutAvailable]
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/site-data', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { mediaRegistry?: MediaRegistry }) => {
        if (!cancelled && data.mediaRegistry) setMediaRegistry(data.mediaRegistry);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const customAmountCents = Math.round(Number(custom) * 100);
  const customValid = Number.isFinite(customAmountCents) && customAmountCents >= 1000 && customAmountCents <= 500_000;

  return (
    <main className='min-h-screen bg-background px-4 py-24 text-foreground sm:px-6'>
      <div className='mx-auto w-full max-w-5xl'>
        <section className='grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center'>
          <div>
            <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Gloss Boss ATX</p>
            <h1 className='mt-3 text-4xl font-black uppercase sm:text-5xl'>Gift the reset they actually want</h1>
            <p className='mt-3 max-w-2xl text-zinc-300'>
              Occasion-based digital gift cards for birthdays, graduations, parent days, thank-yous, and corporate rewards.
            </p>
          </div>
          <div className='relative overflow-hidden rounded-3xl border border-gold/25 bg-black p-5 shadow-[0_0_38px_rgba(212,175,55,0.16)]'>
            <img src={mediaUrl(mediaRegistry, occasion.key)} alt={occasion.label} className='h-52 w-full rounded-2xl object-cover opacity-80' />
            <div className='absolute inset-x-8 bottom-8 rounded-2xl border border-white/15 bg-black/75 p-4 backdrop-blur'>
              <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>{occasion.label}</p>
              <p className='mt-1 text-2xl font-black text-white'>Gloss Boss Gift Card</p>
              <p className='mt-2 line-clamp-2 text-xs text-zinc-300'>{message || 'A premium mobile detail, delivered as a polished gift.'}</p>
            </div>
          </div>
        </section>

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

        <section className='mt-8 grid gap-4 rounded-3xl border border-gold/20 bg-black/45 p-5 md:grid-cols-2'>
          <div className='md:col-span-2 grid gap-3 sm:grid-cols-2'>
            {[
              ['gift', 'Send as gift', 'Recipient receives the email delivery.'],
              ['self', 'Buy for myself', 'Keep it under your purchaser email.'],
            ].map(([id, label, copy]) => (
              <button
                key={id}
                type='button'
                onClick={() => setGiftMode(id as 'gift' | 'self')}
                className={`rounded-2xl border p-4 text-left transition ${giftMode === id ? 'border-gold bg-gold/10 text-white' : 'border-white/10 bg-black/35 text-zinc-300'}`}
              >
                <span className='block text-xs font-black uppercase tracking-[0.18em]'>{label}</span>
                <span className='mt-1 block text-xs text-zinc-400'>{copy}</span>
              </button>
            ))}
          </div>
          <label className='text-sm'>
            <span className='mb-2 block text-zinc-300'>Purchaser email</span>
            <input type='email' value={email} onChange={(e) => setEmail(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' placeholder='you@example.com' />
          </label>
          <label className='text-sm'>
            <span className='mb-2 block text-zinc-300'>Recipient email</span>
            <input type='email' disabled={giftMode === 'self'} value={giftMode === 'self' ? email : recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 disabled:opacity-50' placeholder='recipient@example.com' />
          </label>
          <label className='text-sm'>
            <span className='mb-2 block text-zinc-300'>Delivery date</span>
            <input type='date' value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' />
          </label>
          <label className='text-sm'>
            <span className='mb-2 block text-zinc-300'>Occasion design</span>
            <select value={occasion.id} onChange={(e) => setOccasion(occasions.find((o) => o.id === e.target.value) ?? occasions[0])} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3'>
              {occasions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className='text-sm md:col-span-2'>
            <span className='mb-2 block text-zinc-300'>Personal message</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' rows={3} placeholder='Enjoy a showroom-level reset from Gloss Boss ATX.' />
          </label>
        </section>

        <section className='mt-6 grid gap-3 rounded-3xl border border-white/10 bg-zinc-950/55 p-5 sm:grid-cols-4'>
          {['Good for services', 'Good for add-ons', 'Delivered by email', 'Apply during booking'].map((label) => (
            <div key={label} className='rounded-2xl border border-white/10 bg-black/35 p-4'>
              <p className='text-xs font-black uppercase tracking-[0.16em] text-gold-soft'>{label}</p>
              <p className='mt-2 text-[11px] leading-5 text-zinc-400'>No physical card required unless added later.</p>
            </div>
          ))}
        </section>

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

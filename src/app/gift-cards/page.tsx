import { Suspense } from 'react';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSdk } from '@/lib/stripe/stripeService';
import { GiftCardsClient } from './gift-cards-client';

function GiftCardsFallback() {
  return (
    <main className='flex min-h-screen items-center justify-center bg-background px-4 text-foreground'>
      <p className='text-sm text-zinc-400'>Loading gift cards…</p>
    </main>
  );
}

export default async function GiftCardsPage() {
  let checkoutAvailable = false;
  try {
    const admin = tryCreateAdminSupabase();
    const stripe = await getStripeSdk(admin);
    checkoutAvailable = Boolean(stripe);
  } catch (e) {
    console.warn('[gift-cards] checkout flag', e);
    checkoutAvailable = false;
  }

  return (
    <Suspense fallback={<GiftCardsFallback />}>
      <GiftCardsClient checkoutAvailable={checkoutAvailable} />
    </Suspense>
  );
}

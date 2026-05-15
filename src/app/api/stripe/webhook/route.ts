import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { processCheckoutSessionCompleted } from '@/lib/stripe/checkout';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const admin = tryCreateAdminSupabase();
  const secrets = await getStripeSecrets(admin);

  if (!secrets.secretKey || !secrets.webhookSecret) {
    console.warn('[api/stripe/webhook] Stripe webhook secret or secret key not configured');
    return NextResponse.json({ error: 'STRIPE_NOT_CONFIGURED' }, { status: 503 });
  }

  const stripe = new Stripe(secrets.secretKey);
  const body = await request.text();
  const signature = (await headers()).get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secrets.webhookSecret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    await processCheckoutSessionCompleted({ admin, session });
  }

  return NextResponse.json({ received: true });
}

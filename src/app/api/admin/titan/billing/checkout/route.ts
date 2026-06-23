import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSecrets } from '@/lib/stripe/stripeService';

export async function POST(req: Request) {
  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Server config' }, { status: 500 });

  const { planId } = (await req.json()) as { planId?: string };
  if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 });

  const { data: plan } = await admin.from('titan_subscription_plans').select('*').eq('id', planId).maybeSingle();
  const stripePriceId = (plan as { stripe_price_id?: string } | null)?.stripe_price_id
    ?? process.env[`TITAN_STRIPE_PRICE_${planId.toUpperCase()}`];

  if (!stripePriceId) {
    return NextResponse.json({
      error: 'Stripe price not configured. Set TITAN_STRIPE_PRICE_STARTER etc. or stripe_price_id on plan.',
    }, { status: 503 });
  }

  const secrets = await getStripeSecrets(admin);
  if (!secrets.secretKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(secrets.secretKey);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';

  const checkout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: stripePriceId, quantity: 1 }],
    success_url: `${appUrl}/admin/titan/billing?success=1`,
    cancel_url: `${appUrl}/admin/titan/billing?canceled=1`,
    metadata: { titan_plan_id: planId, workspace_key: 'default' },
    customer_email: session.user.email ?? undefined,
  });

  return NextResponse.json({ url: checkout.url });
}

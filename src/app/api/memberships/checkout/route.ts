import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSdk } from '@/lib/stripe/stripeService';
import { getAppOrigin } from '@/lib/env/app-origin';

export const runtime = 'nodejs';

function recurringFor(interval: string): Stripe.Checkout.SessionCreateParams.LineItem.PriceData.Recurring | undefined {
  const v = interval.toLowerCase().replace(/\s+/g, '_').replace('-', '_');
  if (v === 'weekly' || v === 'week') return { interval: 'week', interval_count: 1 };
  if (v === 'bi_weekly' || v === 'biweekly') return { interval: 'week', interval_count: 2 };
  if (v === 'yearly' || v === 'year') return { interval: 'year', interval_count: 1 };
  if (v === 'monthly' || v === 'month') return { interval: 'month', interval_count: 1 };
  if (v === 'one_time' || v === 'one-time') return undefined;
  return undefined;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Membership checkout is temporarily unavailable.' }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id || !user.email) {
    return NextResponse.json({ error: 'Sign in or create an account to join a membership.' }, { status: 401 });
  }

  const admin = tryCreateAdminSupabase();
  const stripe = await getStripeSdk(admin);
  if (!admin || !stripe) return NextResponse.json({ error: 'Stripe or database unavailable.' }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { planId?: string; interval?: string };
  const planId = String(body.planId ?? '').trim();
  const selectedInterval = String(body.interval ?? 'monthly').trim().toLowerCase().replace(/-+/g, '');
  
  let interval = 'monthly';
  if (selectedInterval === 'weekly' || selectedInterval === 'week') interval = 'weekly';
  else if (selectedInterval === 'biweekly' || selectedInterval === 'bi_weekly' || selectedInterval === 'bi-weekly') interval = 'biweekly';
  else if (selectedInterval === 'yearly' || selectedInterval === 'year') interval = 'yearly';
  else interval = 'monthly';

  const { data: plan, error } = await admin.from('membership_plans').select('*').eq('id', planId).maybeSingle();
  if (error || !plan || plan.archived === true) return NextResponse.json({ error: 'Membership plan unavailable.' }, { status: 404 });

  let amount = 0;
  if (interval === 'weekly') amount = Number(plan.price_weekly_cents ?? 0);
  else if (interval === 'biweekly') amount = Number(plan.price_biweekly_cents ?? 0);
  else if (interval === 'yearly') amount = Number(plan.price_yearly_cents ?? 0);
  else amount = Number(plan.price_monthly_cents ?? 0);

  if (amount <= 0) {
    amount = Number(plan.price_cents ?? 0);
  }

  if (amount < 50) return NextResponse.json({ error: 'This membership plan needs a Stripe price above $0.50.' }, { status: 400 });

  const email = user.email.trim().toLowerCase();
  let { data: customer } = await admin.from('customers').select('id').eq('email', email).maybeSingle();
  if (!customer?.id) {
    const inserted = await admin.from('customers').insert({ email, full_name: user.user_metadata?.full_name ?? email }).select('id').maybeSingle();
    customer = inserted.data;
  }
  if (!customer?.id) {
    return NextResponse.json({ error: 'Could not create your customer profile. Please try again.' }, { status: 500 });
  }

  const recurring = recurringFor(interval);
  const origin = getAppOrigin(request);
  const session = await stripe.checkout.sessions.create({
    mode: recurring ? 'subscription' : 'payment',
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          recurring,
          product_data: {
            name: `Gloss Boss ATX ${String(plan.name)} Membership`,
            description: `Membership plan: ${String(plan.tier ?? plan.name)} (${interval})`.slice(0, 500),
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/memberships/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/memberships?cancelled=1`,
    metadata: {
      kind: 'membership',
      membership_plan_id: String(plan.id),
      customer_id: String(customer.id),
      user_id: user.id,
      customer_email: email,
      billing_interval: interval,
      price_cents: String(amount),
    },
  });

  await admin.from('customer_memberships').insert({
    customer_id: customer.id,
    membership_plan_id: plan.id,
    status: 'pending_payment',
    stripe_checkout_session_id: session.id,
    billing_interval: interval,
    price_cents: amount,
    notes: `Created from public membership checkout. Interval: ${interval}`,
  });

  return NextResponse.json({ ok: true, url: session.url });
}

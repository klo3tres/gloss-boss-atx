import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { processCheckoutSessionCompleted } from '@/lib/stripe/checkout';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import { upsertLedgerFromBalanceTransaction } from '@/lib/financial-ledger';

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

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind === 'membership') {
        if (admin) {
          const customerId = session.metadata.customer_id || null;
          const planId = session.metadata.membership_plan_id || null;
          await admin.from('customer_memberships').upsert(
            {
              customer_id: customerId,
              membership_plan_id: planId,
              status: 'active',
              stripe_checkout_session_id: session.id,
              stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null,
              stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
              started_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'stripe_checkout_session_id' },
          );
          const [{ data: plan }, { data: customer }] = await Promise.all([
            planId ? admin.from('membership_plans').select('name, discount_percent').eq('id', planId).maybeSingle() : Promise.resolve({ data: null }),
            customerId ? admin.from('customers').select('email, phone, full_name, sms_consent, sms_status').eq('id', customerId).maybeSingle() : Promise.resolve({ data: null }),
          ]);
          if (customerId && plan) {
            await admin.from('customers').update({ membership_discount_percent: (plan as { discount_percent?: number }).discount_percent ?? 0 }).eq('id', customerId);
          }
          try {
            const { resendConfigured, sendResendHtml } = await import('@/lib/email-send');
            const email = String((customer as { email?: string } | null)?.email ?? session.customer_details?.email ?? session.customer_email ?? '').trim();
            if (email && resendConfigured()) {
              await sendResendHtml({
                to: email,
                subject: `Gloss Boss ATX membership activated`,
                html: `<p>Your ${String((plan as { name?: string } | null)?.name ?? 'Gloss Boss ATX')} membership is active.</p><p>Sign in to book with member pricing and earn loyalty stamps.</p>`,
              });
            }
            const { sendCustomerSms } = await import('@/lib/sms-send');
            const phone = String((customer as { phone?: string } | null)?.phone ?? '');
            if (phone) {
              await sendCustomerSms({
                db: admin,
                kind: 'membership_confirmation',
                template_key: 'membership_confirmation',
                to: phone,
                customer_id: customerId,
                body: `Gloss Boss ATX: Your ${String((plan as { name?: string } | null)?.name ?? '')} membership is active. Sign in to book with member pricing.`,
              });
            }
          } catch (notifyErr) {
            console.warn('[stripe/webhook] membership notify skipped', notifyErr);
          }
        }
      } else {
        await processCheckoutSessionCompleted({ admin, session });
      }
      console.info('[stripe/webhook] checkout.session.completed processed', session.id, session.metadata?.appointment_id ?? 'gift');
    } else if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const status = event.type === 'payment_intent.succeeded' ? 'succeeded' : 'failed';
      if (event.type === 'payment_intent.payment_failed') {
        try {
          const { notifyOwnerBookingEvent } = await import('@/lib/owner-alerts');
          await notifyOwnerBookingEvent({
            kind: 'payment_failed',
            appointmentId: typeof pi.metadata?.appointment_id === 'string' ? pi.metadata.appointment_id : undefined,
            guestEmail: pi.receipt_email ?? '—',
            totalCents: pi.amount,
            paidCents: 0,
            extraNote: `PaymentIntent ${pi.id} failed: ${pi.last_payment_error?.message ?? 'unknown'}`,
          });
        } catch (e) {
          console.warn('[stripe/webhook] payment_failed owner notify', e);
        }
      }
      const sid = typeof pi.metadata?.checkout_session_id === 'string' ? pi.metadata.checkout_session_id : null;
      const appointmentId =
        typeof pi.metadata?.appointment_id === 'string' ? pi.metadata.appointment_id : null;
      if (admin) {
        const row: Record<string, unknown> = {
          appointment_id: appointmentId,
          stripe_payment_intent_id: pi.id,
          stripe_checkout_session_id: sid,
          amount_cents: pi.amount_received || pi.amount,
          status,
          payment_method: 'stripe',
          payment_kind: pi.metadata?.stripe_checkout_kind ?? 'stripe_payment_intent',
          paid_at: new Date().toISOString(),
        };
        let up = await admin.from('payments').upsert(row, { onConflict: 'stripe_payment_intent_id' });
        if (up.error && isSchemaDriftError(up.error.message)) {
          up = await admin.from('payments').upsert({
            stripe_payment_intent_id: pi.id,
            amount_cents: pi.amount_received || pi.amount,
            status,
          }, { onConflict: 'stripe_payment_intent_id' });
        }
        if (up.error) console.warn('[stripe/webhook] payment_intent upsert', up.error.message);
        try {
          const chargeId =
            typeof pi.latest_charge === 'string'
              ? pi.latest_charge
              : pi.latest_charge && typeof pi.latest_charge === 'object'
                ? pi.latest_charge.id
                : null;
          if (chargeId) {
            const charge = await stripe.charges.retrieve(chargeId);
            const btId = typeof charge.balance_transaction === 'string' ? charge.balance_transaction : charge.balance_transaction?.id;
            if (btId) {
              const tx = await stripe.balanceTransactions.retrieve(btId);
              await upsertLedgerFromBalanceTransaction(admin, tx, {
                paymentIntentId: pi.id,
                chargeId,
                workOrderId: appointmentId,
              });
            }
          }
        } catch (ledgerErr) {
          console.warn('[stripe/webhook] ledger sync skipped', ledgerErr);
        }
      }
    } else if (event.type === 'charge.refunded' || event.type === 'refund.updated') {
      const obj = event.data.object as Stripe.Charge | Stripe.Refund;
      if (admin) {
        await admin.from('payment_reconciliation_events').insert({
          action: event.type,
          status: 'received',
          stripe_payment_intent_id: typeof obj.payment_intent === 'string' ? obj.payment_intent : null,
          payload: obj as unknown as Record<string, unknown>,
        });
        try {
          const bt =
            'balance_transaction' in obj
              ? typeof obj.balance_transaction === 'string'
                ? obj.balance_transaction
                : obj.balance_transaction?.id
              : null;
          if (bt) {
            const tx = await stripe.balanceTransactions.retrieve(bt);
            await upsertLedgerFromBalanceTransaction(admin, tx, {
              paymentIntentId: typeof obj.payment_intent === 'string' ? obj.payment_intent : null,
            });
          }
        } catch (ledgerErr) {
          console.warn('[stripe/webhook] refund ledger sync skipped', ledgerErr);
        }
      }
    } else if (event.type === 'payout.paid' || event.type === 'payout.created') {
      const payout = event.data.object as Stripe.Payout;
      if (admin && typeof payout.balance_transaction === 'string') {
        const tx = await stripe.balanceTransactions.retrieve(payout.balance_transaction);
        await upsertLedgerFromBalanceTransaction(admin, tx, { payoutId: payout.id });
      }
    }
  } catch (e) {
    console.error('[stripe/webhook] event processing failed', event.type, e);
    if (event.type === 'checkout.session.completed' && admin) {
      const session = event.data.object as Stripe.Checkout.Session;
      const { logPaymentDebugEvent } = await import('@/lib/payment-debug');
      await logPaymentDebugEvent(admin, {
        appointmentId: session.metadata?.appointment_id as string | undefined,
        fallbackBookingId: session.metadata?.fallback_booking_id as string | undefined,
        customerEmail: session.customer_details?.email ?? session.customer_email,
        eventType: 'webhook_checkout_failed',
        errorMessage: e instanceof Error ? e.message : String(e),
        metadata: { session_id: session.id },
      });
      try {
        const { notifyOwnerBookingEvent } = await import('@/lib/owner-alerts');
        await notifyOwnerBookingEvent({
          kind: 'payment_failed',
          appointmentId: session.metadata?.appointment_id as string | undefined,
          guestEmail: session.customer_details?.email ?? session.customer_email ?? '—',
          totalCents: session.amount_total ?? 0,
          paidCents: 0,
          extraNote: `Webhook checkout.session.completed failed — use Advanced repair → Sync Stripe. ${e instanceof Error ? e.message : String(e)}`,
        });
      } catch (notifyErr) {
        console.warn('[stripe/webhook] owner notify', notifyErr);
      }
      return NextResponse.json({ error: 'checkout processing failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

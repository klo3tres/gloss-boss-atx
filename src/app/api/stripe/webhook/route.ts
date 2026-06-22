import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { processCheckoutSessionCompleted } from '@/lib/stripe/checkout';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import { upsertLedgerFromBalanceTransaction } from '@/lib/financial-ledger';
import { automateStripePayment, automateStripeRefund } from '@/lib/stripe-automation';

export const runtime = 'nodejs';

function stripeIdFromObj(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'id' in value) return String((value as { id?: unknown }).id ?? '').trim() || null;
  return null;
}

export async function GET() {
  const admin = tryCreateAdminSupabase();
  const secrets = await getStripeSecrets(admin);
  return NextResponse.json({
    ok: true,
    endpoint: 'stripe-webhook',
    method: 'POST required',
    configured: Boolean(secrets.secretKey && secrets.webhookSecret),
    stripeKeyPresent: Boolean(secrets.secretKey),
    webhookSecretPresent: Boolean(secrets.webhookSecret),
    serviceRolePresent: Boolean(admin),
    canonicalUrl: 'https://glossbossatx.com/api/stripe/webhook',
    environment: {
      STRIPE_SECRET_KEY: Boolean(secrets.secretKey),
      STRIPE_WEBHOOK_SECRET: Boolean(secrets.webhookSecret),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(admin),
    },
    aliasUrl: 'https://glossbossatx.com/api/webhooks/stripe',
    emergencyTlsSafeUrl: 'https://www.glossbossatx.com/api/stripe/webhook',
    tlsNote: 'TLS is terminated by the hosting/domain provider before this route runs.',
  });
}

export async function POST(request: Request) {
  const admin = tryCreateAdminSupabase();
  const secrets = await getStripeSecrets(admin);

  if (!secrets.secretKey || !secrets.webhookSecret) {
    const msg = !secrets.secretKey
      ? 'STRIPE_SECRET_KEY missing'
      : 'STRIPE_WEBHOOK_SECRET missing';
    console.error('[api/stripe/webhook]', msg);
    return NextResponse.json({ error: 'STRIPE_NOT_CONFIGURED', blocker: msg }, { status: 503 });
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    console.error('[api/stripe/webhook] signature verification failed:', message);
    try {
      const { notifyOwnerBookingEvent } = await import('@/lib/owner-alerts');
      await notifyOwnerBookingEvent({
        kind: 'webhook_failed',
        extraNote: `Stripe webhook signature verification failed: ${message}`,
      });
    } catch {
      /* non-blocking */
    }
    return NextResponse.json({ error: 'Invalid signature', detail: message }, { status: 400 });
  }

  if (admin) {
    try {
      await admin.from('notification_outbox').insert({
        kind: 'stripe_webhook_received',
        channel: 'internal',
        provider: 'stripe',
        status: 'accepted',
        payload: { event_id: event.id, event_type: event.type },
        created_at: new Date().toISOString(),
      });
    } catch {
      /* non-blocking */
    }
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind === 'membership') {
        if (admin) {
          const customerId = session.metadata.customer_id || null;
          const planId = session.metadata.membership_plan_id || null;
          const stripeCustomerId = stripeIdFromObj(session.customer) || session.metadata.stripe_customer_id || null;
          const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
          let subscriptionPeriod: { start: string | null; end: string | null; cancelAtPeriodEnd: boolean } = {
            start: null,
            end: null,
            cancelAtPeriodEnd: false,
          };
          if (stripeSubscriptionId) {
            try {
              const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
              const subAny = sub as unknown as { current_period_start?: number; current_period_end?: number; cancel_at_period_end?: boolean };
              subscriptionPeriod = {
                start: subAny.current_period_start ? new Date(subAny.current_period_start * 1000).toISOString() : null,
                end: subAny.current_period_end ? new Date(subAny.current_period_end * 1000).toISOString() : null,
                cancelAtPeriodEnd: Boolean(subAny.cancel_at_period_end),
              };
            } catch (subErr) {
              console.warn('[stripe/webhook] membership subscription retrieve skipped', subErr);
            }
          }
          await admin.from('customer_memberships').upsert(
            {
              customer_id: customerId,
              membership_plan_id: planId,
              status: 'active',
              stripe_checkout_session_id: session.id,
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: stripeSubscriptionId,
              stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
              current_period_start: subscriptionPeriod.start,
              current_period_end: subscriptionPeriod.end,
              cancel_at_period_end: subscriptionPeriod.cancelAtPeriodEnd,
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
            await admin
              .from('customers')
              .update({
                membership_discount_percent: (plan as { discount_percent?: number }).discount_percent ?? 0,
                stripe_customer_id: stripeCustomerId,
              })
              .eq('id', customerId);
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
        if (admin) {
          await automateStripePayment({
            admin,
            stripe,
            session,
            eventType: event.type,
            sendCustomerReceipt: false,
          });
        }
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
        if (event.type === 'payment_intent.succeeded') {
          await automateStripePayment({
            admin,
            stripe,
            paymentIntent: pi,
            eventType: event.type,
          });
        }
      }
    } else if (event.type === 'charge.succeeded') {
      const charge = event.data.object as Stripe.Charge;
      if (admin) {
        await automateStripePayment({
          admin,
          stripe,
          charge,
          eventType: event.type,
        });
      }
    } else if (event.type === 'charge.refunded' || event.type === 'refund.updated' || event.type === 'refund.created') {
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
        await automateStripeRefund({
          admin,
          stripe,
          refund: event.type.startsWith('refund.') ? (obj as Stripe.Refund) : null,
          charge: event.type === 'charge.refunded' ? (obj as Stripe.Charge) : null,
          eventType: event.type,
        });
      }
    } else if (event.type === 'payout.paid' || event.type === 'payout.created') {
      const payout = event.data.object as Stripe.Payout;
      if (admin && typeof payout.balance_transaction === 'string') {
        const tx = await stripe.balanceTransactions.retrieve(payout.balance_transaction);
        await upsertLedgerFromBalanceTransaction(admin, tx, { payoutId: payout.id });
      }
    } else if (event.type === 'balance.available') {
      if (admin) {
        try {
          const txs = await stripe.balanceTransactions.list({ limit: 100 });
          for (const tx of txs.data) await upsertLedgerFromBalanceTransaction(admin, tx);
        } catch (ledgerErr) {
          console.warn('[stripe/webhook] balance.available ledger sync skipped', ledgerErr);
        }
      }
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      if (admin) {
        const subAny = subscription as unknown as { current_period_start?: number; current_period_end?: number };
        const status = event.type === 'customer.subscription.deleted'
          ? 'canceled'
          : subscription.cancel_at_period_end
            ? 'canceling'
            : subscription.status === 'active' || subscription.status === 'trialing'
              ? 'active'
              : subscription.status;
        const { error } = await admin
          .from('customer_memberships')
          .update({
            status,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: stripeIdFromObj(subscription.customer),
            current_period_start: subAny.current_period_start ? new Date(subAny.current_period_start * 1000).toISOString() : null,
            current_period_end: subAny.current_period_end ? new Date(subAny.current_period_end * 1000).toISOString() : null,
            cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
            ends_at: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
            canceled_at: event.type === 'customer.subscription.deleted' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);
        if (error && !isSchemaDriftError(error.message)) console.warn('[stripe/webhook] subscription membership update', error.message);
        await admin.from('notification_outbox').insert({
          kind: event.type === 'customer.subscription.deleted' ? 'membership_canceled' : 'membership_updated',
          channel: 'internal',
          provider: 'stripe',
          status: 'accepted',
          payload: { stripe_subscription_id: subscription.id, status },
          created_at: new Date().toISOString(),
        });
      }
    } else if (event.type === 'invoice.payment_succeeded' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      if (admin) {
        const invoiceAny = invoice as unknown as { subscription?: unknown };
        const subscriptionId = typeof invoiceAny.subscription === 'string' ? invoiceAny.subscription : stripeIdFromObj(invoiceAny.subscription);
        if (subscriptionId) {
          const { data: membership } = await admin
            .from('customer_memberships')
            .select('id, customer_id, membership_plan_id, credit_balance_cents, membership_plans(quarterly_credit_cents, annual_credit_cents, tier)')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle();
          await admin
            .from('customer_memberships')
            .update({
              status: event.type === 'invoice.payment_succeeded' ? 'active' : 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', subscriptionId);
          if (event.type === 'invoice.payment_succeeded' && membership?.id) {
            const plan = Array.isArray((membership as any).membership_plans)
              ? (membership as any).membership_plans[0]
              : (membership as any).membership_plans;
            const creditCents = Number(plan?.quarterly_credit_cents ?? 0) || Number(plan?.annual_credit_cents ?? 0) || 0;
            if (creditCents > 0) {
              const nextBalance = Number((membership as any).credit_balance_cents ?? 0) + creditCents;
              await admin.from('customer_memberships').update({
                credit_balance_cents: nextBalance,
                last_credit_refresh_at: new Date().toISOString(),
              }).eq('id', (membership as any).id);
              await admin.from('membership_credit_ledger').insert({
                customer_id: (membership as any).customer_id ?? null,
                customer_membership_id: (membership as any).id,
                membership_plan_id: (membership as any).membership_plan_id ?? null,
                amount_cents: creditCents,
                balance_after_cents: nextBalance,
                reason: 'stripe_invoice_payment_succeeded',
                stripe_invoice_id: invoice.id,
                stripe_subscription_id: subscriptionId,
              });
            }
          }
        }
        await admin.from('notification_outbox').insert({
          kind: event.type === 'invoice.payment_succeeded' ? 'membership_invoice_paid' : 'membership_invoice_failed',
          channel: 'internal',
          provider: 'stripe',
          status: 'accepted',
          payload: {
            stripe_invoice_id: invoice.id,
            stripe_subscription_id: subscriptionId,
            amount_paid: invoice.amount_paid,
            amount_due: invoice.amount_due,
            customer_email: invoice.customer_email,
          },
          created_at: new Date().toISOString(),
        });
      }
    }
  } catch (e) {
    console.error('[stripe/webhook] event processing failed', event.type, e);
    if (admin) {
      try {
        await admin.from('notification_outbox').insert({
          kind: 'stripe_webhook_failed',
          channel: 'internal',
          provider: 'stripe',
          status: 'failed',
          error_message: e instanceof Error ? e.message : String(e),
          payload: { event_id: event.id, event_type: event.type },
          created_at: new Date().toISOString(),
        });
      } catch {
        /* non-blocking */
      }
    }
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

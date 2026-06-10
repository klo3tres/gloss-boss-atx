import Link from 'next/link';
import { notFound } from 'next/navigation';
import Stripe from 'stripe';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { displayMoney } from '@/lib/display-format';
import { getStripeFinanceSnapshot, type StripeFinanceSnapshot } from '@/lib/stripe-finance-sync';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { addManualExpenseAction, resyncStripeTransactionsAction } from './actions';

export const dynamic = 'force-dynamic';

function fmt(v: unknown) {
  if (!v) return 'Never';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(String(v)));
}

export default async function StripeSyncPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const [ledgerRes, paymentsRes, refundsRes, payoutsRes, dbAllPaymentsRes] = await Promise.all([
    admin.from('financial_ledger').select('*').eq('source', 'stripe').order('created_at', { ascending: false }).limit(20),
    admin.from('payments').select('*').eq('payment_method', 'stripe').order('created_at', { ascending: false }).limit(10),
    admin.from('financial_ledger').select('*').eq('type', 'refund').order('occurred_at', { ascending: false }).limit(10),
    admin.from('financial_ledger').select('*').eq('type', 'payout').order('occurred_at', { ascending: false }).limit(10),
    admin.from('payments').select('id, amount_cents, status, stripe_payment_intent_id, stripe_checkout_session_id, exclude_from_revenue, appointment_id, appointments(id, service_slug, customers(id, full_name, email))').order('created_at', { ascending: false }).limit(100),
  ]);

  let stripeSnapshot: StripeFinanceSnapshot | null = null;
  const secrets = await getStripeSecrets(admin);
  if (secrets.secretKey) {
    try {
      const stripe = new Stripe(secrets.secretKey);
      stripeSnapshot = await getStripeFinanceSnapshot(stripe);
    } catch {
      stripeSnapshot = null;
    }
  }

  const latestLedger = ledgerRes.data?.[0] as Record<string, unknown> | undefined;

  const livePayments = stripeSnapshot?.recentPayments ?? [];
  const dbPayments = (dbAllPaymentsRes?.data ?? []) as any[];

  // Helper to diagnose each live Stripe charge
  const diagnostics = livePayments.map((liveCharge) => {
    const matches = dbPayments.filter(
      (p) =>
        p.stripe_payment_intent_id === liveCharge.paymentIntentId ||
        p.stripe_payment_intent_id === liveCharge.id ||
        p.stripe_checkout_session_id === liveCharge.checkoutSessionId ||
        p.id === liveCharge.id ||
        (p.stripe_payment_intent_id && liveCharge.description?.includes(p.stripe_payment_intent_id))
    );

    const dbInserted = matches.length > 0;
    const isDuplicate = matches.length > 1;
    const isExcluded = matches.some((p) => p.exclude_from_revenue);
    
    let exclusionReason = '';
    if (isExcluded) {
      exclusionReason = 'Marked as excluded in DB';
    } else if (liveCharge.amount === 0) {
      exclusionReason = 'Zero-amount setup/test charge';
    } else if (liveCharge.status !== 'succeeded') {
      exclusionReason = `Stripe charge status is ${liveCharge.status}`;
    } else if (!dbInserted) {
      exclusionReason = 'Charge not synced to DB';
    }

    const firstMatch = matches[0];
    const appointment = firstMatch?.appointments;
    const customer = appointment?.customers;

    return {
      chargeId: liveCharge.id,
      paymentIntentId: liveCharge.paymentIntentId ?? null,
      checkoutSessionId: liveCharge.checkoutSessionId ?? null,
      customerEmail: liveCharge.customerEmail ?? null,
      customerNameFromStripe: liveCharge.customerName ?? null,
      amount: liveCharge.amount,
      status: liveCharge.status,
      created: liveCharge.created,
      dbInserted,
      isDuplicate,
      isExcluded,
      exclusionReason,
      appointmentId: appointment?.id || null,
      serviceSlug: appointment?.service_slug || null,
      customerId: customer?.id || null,
      customerName: customer?.full_name || customer?.email || null,
      action: isDuplicate ? 'REVIEW DUPLICATE' : !dbInserted ? 'FIX' : !appointment?.id ? 'LINK' : 'VERIFIED',
    };
  });

  return (
    <DashboardShell title='Stripe sync' subtitle='Payments, fees, refunds, payouts, and Stripe balance status.' role='admin'>
      <section className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <div className='rounded-2xl border border-white/10 bg-black/40 p-5'><p className='text-xs uppercase text-zinc-500'>Last successful Stripe sync</p><p className='mt-2 text-sm font-bold text-white'>{fmt(latestLedger?.created_at)}</p></div>
        <div className='rounded-2xl border border-white/10 bg-black/40 p-5'><p className='text-xs uppercase text-zinc-500'>Payment available balance</p><p className='mt-2 text-2xl font-black text-white'>{stripeSnapshot?.paymentAvailableCents == null ? 'Unavailable' : displayMoney(stripeSnapshot.paymentAvailableCents)}</p></div>
        <div className='rounded-2xl border border-white/10 bg-black/40 p-5'><p className='text-xs uppercase text-zinc-500'>Payment pending balance</p><p className='mt-2 text-2xl font-black text-white'>{stripeSnapshot?.paymentPendingCents == null ? 'Unavailable' : displayMoney(stripeSnapshot.paymentPendingCents)}</p></div>
        <a href='https://dashboard.stripe.com/' target='_blank' rel='noreferrer' className='rounded-2xl border border-gold/20 bg-gold/10 p-5 text-sm font-black uppercase text-gold-soft'>Open Stripe Dashboard</a>
      </section>

      {stripeSnapshot?.treasuryAvailableCents != null || (stripeSnapshot?.recentCardSpends ?? []).length > 0 ? (
        <section className='grid gap-3 sm:grid-cols-2'>
          {stripeSnapshot?.treasuryAvailableCents != null ? (
            <div className='rounded-2xl border border-white/10 bg-black/40 p-5'>
              <p className='text-xs uppercase text-zinc-500'>Treasury / financial account balance</p>
              <p className='mt-2 text-2xl font-black text-white'>{displayMoney(stripeSnapshot.treasuryAvailableCents)}</p>
            </div>
          ) : null}
          {(stripeSnapshot?.recentCardSpends ?? []).length > 0 ? (
            <div className='rounded-2xl border border-white/10 bg-black/40 p-5'>
              <p className='text-xs uppercase text-zinc-500'>Stripe card / issuing spend</p>
              <p className='mt-2 text-2xl font-black text-white'>{displayMoney(Math.abs((stripeSnapshot?.recentCardSpends ?? []).reduce((s, r) => s + r.amount, 0)))}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Stripe root-cause sync controls</p>
            <p className='mt-2 text-xs text-zinc-500'>All buttons run the safe financial sync and stamp the ledger with the scope you selected.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${secrets.secretKey ? 'border border-emerald-500/35 bg-emerald-500/10 text-emerald-200' : 'border border-amber-500/35 bg-amber-500/10 text-amber-100'}`}>
            {secrets.secretKey ? `Stripe key: ${secrets.source}` : 'Stripe key missing'}
          </span>
        </div>
        <div className='mt-4 grid gap-2 sm:grid-cols-4'>
          {[
            ['all', 'Resync all finance'],
            ['balance_transactions', 'Balance transactions'],
            ['payments_payouts', 'Payments + payouts'],
            ['fees_refunds', 'Fees + refunds'],
          ].map(([scope, label]) => (
            <form key={scope} action={resyncStripeTransactionsAction}>
              <input type='hidden' name='scope' value={scope} />
              <button className='w-full rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-50' disabled={!secrets.secretKey}>
                {label}
              </button>
            </form>
          ))}
        </div>
        <p className='mt-3 text-xs text-zinc-500'>Imports Stripe balance transactions into the financial ledger. Treasury and Issuing are displayed only when Stripe returns them.</p>
      </section>

      <form action={addManualExpenseAction} className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Manual expense</p>
        <div className='mt-3 grid gap-2 sm:grid-cols-3'>
          <input name='description' required placeholder='Big Frog Custom T-Shirt' className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <input name='amount' required type='number' min='0' step='0.01' placeholder='54.13' className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <select name='category' className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'>
            {['supplies', 'shirts/uniforms', 'chemicals', 'fuel', 'equipment', 'software', 'ads', 'tools', 'refunds', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select name='payment_method' className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'>
            {['Stripe card', 'debit card', 'credit card', 'cash', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input name='occurred_at' type='date' className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <button className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Add expense</button>
        </div>
      </form>

      {/* Stripe Sync Diagnostics Table */}
      <section className='rounded-2xl border border-white/10 bg-black/35 p-5'>
        <p className='text-xs font-black uppercase tracking-wider text-gold-soft mb-3'>Stripe Revenue Sync Diagnostics</p>
        <div className='overflow-x-auto'>
          <table className='w-full text-left text-xs text-zinc-300 border-collapse'>
            <thead>
              <tr className='border-b border-white/10 text-zinc-400 font-bold uppercase tracking-wider text-[10px]'>
                <th className='pb-2.5 pr-4'>Charge / PI ID</th>
                <th className='pb-2.5 pr-4'>Amount</th>
                <th className='pb-2.5 pr-4'>Status</th>
                <th className='pb-2.5 pr-4'>Stripe Customer</th>
                <th className='pb-2.5 pr-4'>DB Sync</th>
                <th className='pb-2.5 pr-4'>Excluded</th>
                <th className='pb-2.5 pr-4'>Duplicate</th>
                <th className='pb-2.5 pr-4'>Linked Work Order / Customer</th>
                <th className='pb-2.5'>Action</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.length === 0 ? (
                <tr>
                  <td colSpan={9} className='py-4 text-center text-zinc-500 italic'>No recent charges retrieved from Stripe API.</td>
                </tr>
              ) : (
                diagnostics.map((d) => (
                  <tr key={d.chargeId} className='border-b border-white/5 hover:bg-white/5 transition'>
                    <td className='py-2.5 pr-4 font-mono select-all text-[11px]'>
                      <p>{d.chargeId}</p>
                      <p className='text-zinc-500'>{d.paymentIntentId ?? 'no payment intent'}</p>
                      {d.checkoutSessionId ? <p className='text-zinc-600'>{d.checkoutSessionId}</p> : null}
                    </td>
                    <td className='py-2.5 pr-4 font-semibold text-white'>{displayMoney(d.amount)}</td>
                    <td className='py-2.5 pr-4'>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${d.status === 'succeeded' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-400'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className='py-2.5 pr-4'>
                      <p className='text-white'>{d.customerNameFromStripe ?? 'Unknown'}</p>
                      <p className='text-[10px] text-zinc-500'>{d.customerEmail ?? 'No email returned'}</p>
                    </td>
                    <td className='py-2.5 pr-4'>
                      {d.dbInserted ? (
                        <span className='text-emerald-400 font-bold'>Yes</span>
                      ) : (
                        <span className='text-rose-400 font-bold'>No</span>
                      )}
                    </td>
                    <td className='py-2.5 pr-4'>
                      {d.isExcluded ? (
                        <span className='text-amber-400 font-bold' title={d.exclusionReason}>Yes ({d.exclusionReason})</span>
                      ) : d.exclusionReason ? (
                        <span className='text-zinc-500 italic'>{d.exclusionReason}</span>
                      ) : (
                        <span className='text-zinc-400'>No</span>
                      )}
                    </td>
                    <td className='py-2.5 pr-4'>
                      {d.isDuplicate ? (
                        <span className='text-rose-500 font-bold animate-pulse'>⚠️ Yes</span>
                      ) : (
                        <span className='text-zinc-400'>No</span>
                      )}
                    </td>
                    <td className='py-2.5'>
                      {d.appointmentId ? (
                        <div className='flex flex-col gap-0.5'>
                          <Link href={`/admin/work-orders?id=${d.appointmentId}`} className='text-gold-soft hover:underline font-bold font-mono'>
                            WO: {d.serviceSlug || d.appointmentId.slice(0, 8)}
                          </Link>
                          {d.customerName && (
                            <span className='text-[10px] text-zinc-500'>{d.customerName}</span>
                          )}
                        </div>
                      ) : (
                        <span className='text-zinc-500 italic'>None</span>
                      )}
                    </td>
                    <td className='py-2.5'>
                      {d.action === 'FIX' ? (
                        <form action={resyncStripeTransactionsAction}>
                          <input type='hidden' name='scope' value='payments_payouts' />
                          <button className='rounded-lg bg-gold px-3 py-1.5 text-[10px] font-black uppercase text-black'>Fix</button>
                        </form>
                      ) : d.action === 'LINK' ? (
                        <Link href='/admin/payments' className='rounded-lg border border-gold/30 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft'>Link</Link>
                      ) : (
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${d.action === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-200'}`}>{d.action}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className='grid gap-4 lg:grid-cols-2'>
        <div className='rounded-2xl border border-white/10 bg-black/35 p-5'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Recent Stripe fees/refunds/payouts</p>
          <ul className='mt-3 space-y-2 text-xs text-zinc-300'>
            {[...(ledgerRes.data ?? []), ...(refundsRes.data ?? []), ...(payoutsRes.data ?? [])].slice(0, 12).map((r: any) => (
              <li key={r.id} className='rounded border border-white/10 px-3 py-2 flex justify-between items-center'>
                <div className='flex gap-2 items-center'>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${r.type === 'refund' ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20' : r.type === 'payout' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'}`}>
                    {r.type}
                  </span>
                  <span className='text-zinc-400'>{r.description || 'Stripe Sync Item'}</span>
                </div>
                <div className='text-right'>
                  <span className='font-mono font-bold'>{displayMoney(r.net_amount ?? r.amount ?? 0)}</span>
                  <span className='block text-[10px] text-zinc-500'>{fmt(r.occurred_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className='rounded-2xl border border-white/10 bg-black/35 p-5'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Recent transfers</p>
          <ul className='mt-3 space-y-2 text-xs text-zinc-300'>
            {(stripeSnapshot?.recentTransfers ?? []).map((t) => <li key={t.id} className='rounded border border-white/10 px-3 py-2'>{displayMoney(t.amount)} - {t.description ?? t.destination ?? 'Transfer'} - {fmt(new Date(t.created * 1000).toISOString())}</li>)}
            {(stripeSnapshot?.recentTransfers ?? []).length === 0 ? <li className='text-zinc-500'>No recent transfers returned by Stripe API.</li> : null}
          </ul>
        </div>
      </section>

      {(stripeSnapshot?.recentCardSpends ?? []).length > 0 ? (
        <section className='rounded-2xl border border-white/10 bg-black/35 p-5'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Recent card spends / issuing</p>
          <ul className='mt-3 space-y-2 text-xs text-zinc-300'>
            {(stripeSnapshot?.recentCardSpends ?? []).map((t) => <li key={t.id} className='rounded border border-white/10 px-3 py-2'>{displayMoney(t.amount)} - {t.merchant ?? 'Card spend'} - {fmt(new Date(t.created * 1000).toISOString())}</li>)}
          </ul>
        </section>
      ) : null}

      <p className='text-xs text-zinc-500'>Manual expenses keep profit accurate for purchases that are not returned by Stripe balance transactions.</p>
      <Link href='/admin/revenue' className='text-xs font-bold uppercase text-gold-soft underline'>Back to revenue</Link>
    </DashboardShell>
  );
}

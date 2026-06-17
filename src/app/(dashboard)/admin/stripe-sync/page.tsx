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

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export default async function StripeSyncPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSessionWithProfile();
  const sp = searchParams ? await searchParams : {};
  const syncOkRaw = typeof sp.syncOk === 'string' ? sp.syncOk : Array.isArray(sp.syncOk) ? sp.syncOk[0] : '';
  const syncErrRaw = typeof sp.syncErr === 'string' ? sp.syncErr : Array.isArray(sp.syncErr) ? sp.syncErr[0] : '';
  const syncOk = syncOkRaw ? safeDecode(syncOkRaw) : '';
  const syncErr = syncErrRaw ? safeDecode(syncErrRaw) : '';
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
    <DashboardShell title='Stripe Sync Control' subtitle='Financial audit logs, card spend, and live Stripe data synchronization.' role='admin'>
      {syncOk ? (
        <section className='mb-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100'>
          {syncOk}
        </section>
      ) : null}
      {syncErr ? (
        <section className='mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-100'>
          {syncErr}
        </section>
      ) : null}

      {/* Hero Financial KPI Cards */}
      <section className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8'>
        <div className='gb-premium-card rounded-2xl p-5'>
          <p className='gb-luxury-eyebrow'>Last Sync Status</p>
          <p className='mt-2.5 text-xs font-bold text-zinc-300'>{fmt(latestLedger?.created_at)}</p>
        </div>
        <div className='gb-premium-card rounded-2xl p-5'>
          <p className='gb-luxury-eyebrow'>Available Balance</p>
          <p className='mt-1.5 text-2xl font-black text-white tracking-tight'>
            {stripeSnapshot?.paymentAvailableCents == null ? 'Unavailable' : displayMoney(stripeSnapshot.paymentAvailableCents)}
          </p>
        </div>
        <div className='gb-premium-card rounded-2xl p-5'>
          <p className='gb-luxury-eyebrow'>Pending Balance</p>
          <p className='mt-1.5 text-2xl font-black text-white tracking-tight'>
            {stripeSnapshot?.paymentPendingCents == null ? 'Unavailable' : displayMoney(stripeSnapshot.paymentPendingCents)}
          </p>
        </div>
        <a 
          href='https://dashboard.stripe.com/' 
          target='_blank' 
          rel='noreferrer' 
          className='gb-premium-card gb-luxury-card-hover rounded-2xl p-5 flex flex-col justify-between group border border-gold/15'
        >
          <span className='gb-luxury-eyebrow text-gold-soft group-hover:text-white transition'>Stripe Dashboard</span>
          <span className='mt-3 text-xs font-black uppercase tracking-widest text-gold-soft group-hover:underline'>
            Open Console →
          </span>
        </a>
      </section>

      {stripeSnapshot?.treasuryAvailableCents != null || (stripeSnapshot?.recentCardSpends ?? []).length > 0 ? (
        <section className='grid gap-4 sm:grid-cols-2 mb-8'>
          {stripeSnapshot?.treasuryAvailableCents != null ? (
            <div className='gb-premium-card rounded-2xl p-5'>
              <p className='gb-luxury-eyebrow'>Treasury Capital</p>
              <p className='mt-1.5 text-2xl font-black text-white tracking-tight'>{displayMoney(stripeSnapshot.treasuryAvailableCents)}</p>
            </div>
          ) : null}
          {(stripeSnapshot?.recentCardSpends ?? []).length > 0 ? (
            <div className='gb-premium-card rounded-2xl p-5'>
              <p className='gb-luxury-eyebrow'>Card Issuing Spend</p>
              <p className='mt-1.5 text-2xl font-black text-white tracking-tight'>
                {displayMoney(Math.abs((stripeSnapshot?.recentCardSpends ?? []).reduce((s, r) => s + r.amount, 0)))}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {stripeSnapshot?.issuingUnavailableReason || stripeSnapshot?.treasuryUnavailableReason ? (
        <section className='rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4 text-xs text-amber-200/80 mb-8 max-w-3xl space-y-1.5'>
          <p className='font-black uppercase tracking-wider text-amber-300'>Diagnostic Notices</p>
          {stripeSnapshot?.issuingUnavailableReason ? <p>{stripeSnapshot.issuingUnavailableReason}</p> : null}
          {stripeSnapshot?.treasuryUnavailableReason ? <p>{stripeSnapshot.treasuryUnavailableReason}</p> : null}
        </section>
      ) : null}

      {/* Sync Operations Control */}
      <section className='gb-premium-card rounded-3xl p-6 mb-6'>
        <div className='flex flex-wrap items-center justify-between gap-3 mb-6'>
          <div>
            <h2 className='text-sm font-black uppercase tracking-wider text-gold-soft'>Financial Resync Tools</h2>
            <p className='mt-1 text-xs text-zinc-500'>Stamps the ledger with database-wide checks for the selected scope.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${secrets.secretKey ? 'border border-emerald-500/20 bg-emerald-500/5 text-emerald-300' : 'border border-amber-500/20 bg-amber-500/5 text-amber-300'}`}>
            {secrets.secretKey ? `Stripe API: ${secrets.source}` : 'Key Missing'}
          </span>
        </div>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          {[
            ['all', 'Resync All Finance'],
            ['balance_transactions', 'Balance Transactions'],
            ['payments_payouts', 'Payments & Payouts'],
            ['fees_refunds', 'Fees & Refunds'],
          ].map(([scope, label]) => (
            <form key={scope} action={resyncStripeTransactionsAction} className="w-full">
              <input type='hidden' name='scope' value={scope} />
              <button 
                className='w-full rounded-xl bg-zinc-900 border border-white/10 hover:border-gold/30 hover:bg-black py-3 px-4 text-xs font-black uppercase tracking-wider text-zinc-300 hover:text-gold-soft disabled:opacity-30 disabled:pointer-events-none transition duration-200' 
                disabled={!secrets.secretKey}
              >
                {label}
              </button>
            </form>
          ))}
        </div>
      </section>

      {/* Manual Expense Accordion */}
      <details className='mb-6 rounded-3xl border border-gold/15 bg-black/45 p-5 group'>
        <summary className="cursor-pointer font-bold text-xs uppercase tracking-[0.2em] text-zinc-400 hover:text-gold-soft transition select-none flex items-center justify-between">
          <span>Add Manual Expense Record</span>
          <span className="text-[10px] text-zinc-500 font-normal py-1 px-3 border border-white/10 rounded-lg bg-zinc-950/40">Toggle Form</span>
        </summary>
        <div className="mt-5 pt-5 border-t border-white/5">
          <form action={addManualExpenseAction} className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            <label className="block text-xs text-zinc-400">
              Description
              <input name='description' required placeholder='Big Frog Custom T-Shirt' className='mt-1.5 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white focus:border-gold/50 outline-none transition' />
            </label>
            <label className="block text-xs text-zinc-400">
              Amount ($)
              <input name='amount' required type='number' min='0' step='0.01' placeholder='54.13' className='mt-1.5 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white focus:border-gold/50 outline-none transition' />
            </label>
            <label className="block text-xs text-zinc-400">
              Category
              <select name='category' className='mt-1.5 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2.5 text-sm text-white focus:border-gold/50 outline-none transition'>
                {['supplies', 'shirts/uniforms', 'chemicals', 'fuel', 'equipment', 'software', 'ads', 'tools', 'refunds', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block text-xs text-zinc-400">
              Payment Method
              <select name='payment_method' className='mt-1.5 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2.5 text-sm text-white focus:border-gold/50 outline-none transition'>
                {['Stripe card', 'debit card', 'credit card', 'cash', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block text-xs text-zinc-400">
              Date
              <input name='occurred_at' type='date' className='mt-1.5 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white focus:border-gold/50 outline-none transition' />
            </label>
            <div className="flex items-end">
              <button className='w-full rounded-xl bg-gold py-3 text-xs font-black uppercase tracking-wider text-black hover:brightness-110 transition duration-200'>
                Save Expense
              </button>
            </div>
          </form>
        </div>
      </details>

      {/* Stripe Sync Diagnostics Table Collapsed */}
      <details className='mb-6 rounded-3xl border border-gold/15 bg-black/45 p-5 group'>
        <summary className="cursor-pointer font-bold text-xs uppercase tracking-[0.2em] text-zinc-400 hover:text-gold-soft transition select-none flex items-center justify-between">
          <span>Stripe Revenue Sync Diagnostics</span>
          <span className="text-[10px] text-zinc-500 font-normal py-1 px-3 border border-white/10 rounded-lg bg-zinc-950/40">Toggle Table</span>
        </summary>
        <div className="mt-5 pt-5 border-t border-white/5">
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-xs text-zinc-300 border-collapse'>
              <thead>
                <tr className='border-b border-white/10 text-zinc-400 font-bold uppercase tracking-wider text-[10px]'>
                  <th className='pb-3 pr-4'>Charge / PI ID</th>
                  <th className='pb-3 pr-4'>Amount</th>
                  <th className='pb-3 pr-4'>Status</th>
                  <th className='pb-3 pr-4'>Stripe Customer</th>
                  <th className='pb-3 pr-4'>DB Sync</th>
                  <th className='pb-3 pr-4'>Excluded</th>
                  <th className='pb-3 pr-4'>Duplicate</th>
                  <th className='pb-3 pr-4'>Linked Work Order</th>
                  <th className='pb-3'>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {diagnostics.length === 0 ? (
                  <tr>
                    <td colSpan={9} className='py-6 text-center text-zinc-500 italic'>No recent charges retrieved from Stripe API.</td>
                  </tr>
                ) : (
                  diagnostics.map((d) => (
                    <tr key={d.chargeId} className='hover:bg-white/5 transition'>
                      <td className='py-3 pr-4 font-mono select-all text-[11px] leading-snug'>
                        <p className="text-zinc-200 font-medium">{d.chargeId}</p>
                        <p className='text-zinc-500 text-[10px]'>{d.paymentIntentId ?? 'no PI'}</p>
                        {d.checkoutSessionId ? <p className='text-zinc-600 text-[9px]'>{d.checkoutSessionId}</p> : null}
                      </td>
                      <td className='py-3 pr-4 font-semibold text-white'>{displayMoney(d.amount)}</td>
                      <td className='py-3 pr-4'>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${d.status === 'succeeded' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-400'}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className='py-3 pr-4 max-w-[150px] truncate'>
                        <p className='text-white font-bold'>{d.customerNameFromStripe ?? 'Unknown'}</p>
                        <p className='text-[10px] text-zinc-500'>{d.customerEmail ?? 'No email'}</p>
                      </td>
                      <td className='py-3 pr-4'>
                        {d.dbInserted ? (
                          <span className='text-emerald-400 font-bold'>Yes</span>
                        ) : (
                          <span className='text-rose-400 font-bold'>No</span>
                        )}
                      </td>
                      <td className='py-3 pr-4 max-w-[120px] truncate'>
                        {d.isExcluded ? (
                          <span className='text-amber-400 font-bold' title={d.exclusionReason}>Yes</span>
                        ) : d.exclusionReason ? (
                          <span className='text-zinc-500 italic'>{d.exclusionReason}</span>
                        ) : (
                          <span className='text-zinc-400'>No</span>
                        )}
                      </td>
                      <td className='py-3 pr-4'>
                        {d.isDuplicate ? (
                          <span className='text-rose-500 font-bold animate-pulse'>⚠️ Yes</span>
                        ) : (
                          <span className='text-zinc-400'>No</span>
                        )}
                      </td>
                      <td className='py-3 pr-4'>
                        {d.appointmentId ? (
                          <div className='flex flex-col gap-0.5'>
                            <Link href={`/admin/work-orders?id=${d.appointmentId}`} className='text-gold hover:underline font-bold font-mono text-[11px]'>
                              WO: {d.serviceSlug || d.appointmentId.slice(0, 8)}
                            </Link>
                            {d.customerName && (
                              <span className='text-[10px] text-zinc-500 truncate max-w-[120px]'>{d.customerName}</span>
                            )}
                          </div>
                        ) : (
                          <span className='text-zinc-500 italic'>None</span>
                        )}
                      </td>
                      <td className='py-3'>
                        {d.action === 'FIX' ? (
                          <form action={resyncStripeTransactionsAction}>
                            <input type='hidden' name='scope' value='payments_payouts' />
                            <button className='rounded-lg bg-gold px-2.5 py-1 text-[9px] font-black uppercase text-black'>Fix</button>
                          </form>
                        ) : d.action === 'LINK' ? (
                          <Link href='/admin/payments' className='rounded-lg border border-gold/30 px-2.5 py-1 text-[9px] font-black uppercase text-gold-soft'>Link</Link>
                        ) : (
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${d.action === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/15' : 'bg-amber-500/10 text-amber-200 border border-amber-500/15'}`}>{d.action}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <section className='grid gap-6 lg:grid-cols-2 mb-6'>
        {/* Ledger */}
        <div className='gb-premium-card rounded-3xl p-6'>
          <p className='gb-luxury-eyebrow mb-4'>Audit Ledger Stream</p>
          <ul className='space-y-2.5 text-xs'>
            {[...(ledgerRes.data ?? []), ...(refundsRes.data ?? []), ...(payoutsRes.data ?? [])].slice(0, 10).map((r: any) => (
              <li key={r.id} className='rounded-xl border border-white/5 bg-zinc-950/40 hover:border-white/10 px-3.5 py-2.5 flex justify-between items-center transition'>
                <div className='flex gap-2 items-center min-w-0'>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase shrink-0 ${r.type === 'refund' ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20' : r.type === 'payout' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'}`}>
                    {r.type}
                  </span>
                  <span className='text-zinc-300 truncate text-[11px]'>{r.description || 'Stripe Ledger Item'}</span>
                </div>
                <div className='text-right shrink-0 ml-3'>
                  <span className='font-mono font-bold text-white'>{displayMoney(r.net_amount ?? r.amount ?? 0)}</span>
                  <span className='block text-[9px] text-zinc-500 mt-0.5'>{fmt(r.occurred_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Transfers */}
        <div className='gb-premium-card rounded-3xl p-6'>
          <p className='gb-luxury-eyebrow mb-4'>Recent Stripe Transfers</p>
          <ul className='space-y-2.5 text-xs'>
            {(stripeSnapshot?.recentTransfers ?? []).map((t) => (
              <li key={t.id} className='rounded-xl border border-white/5 bg-zinc-950/40 px-3.5 py-2.5 flex justify-between items-center'>
                <span className="text-zinc-300 font-medium truncate max-w-[180px]">{t.description ?? t.destination ?? 'Stripe Transfer'}</span>
                <div className='text-right shrink-0'>
                  <span className="font-mono font-bold text-white">{displayMoney(t.amount)}</span>
                  <span className="block text-[9px] text-zinc-500 mt-0.5">{fmt(new Date(t.created * 1000).toISOString())}</span>
                </div>
              </li>
            ))}
            {(stripeSnapshot?.recentTransfers ?? []).length === 0 ? (
              <li className='text-zinc-500 text-center py-8 border border-dashed border-white/5 rounded-xl'>No recent transfers.</li>
            ) : null}
          </ul>
        </div>
      </section>

      {/* Card Spends */}
      {(stripeSnapshot?.recentCardSpends ?? []).length > 0 ? (
        <section className='gb-premium-card rounded-3xl p-6 mb-6'>
          <p className='gb-luxury-eyebrow mb-4'>Corporate Card Ledger</p>
          <ul className='space-y-2.5 text-xs'>
            {(stripeSnapshot?.recentCardSpends ?? []).map((t) => (
              <li key={t.id} className='rounded-xl border border-white/5 bg-zinc-950/40 px-3.5 py-2.5 flex justify-between items-center'>
                <span className="text-zinc-300 font-medium truncate">{t.merchant ?? 'Card Spend'}</span>
                <div className='text-right shrink-0 ml-3'>
                  <span className="font-mono font-bold text-white">{displayMoney(t.amount)}</span>
                  <span className="block text-[9px] text-zinc-500 mt-0.5">{fmt(new Date(t.created * 1000).toISOString())}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className='flex items-center justify-between border-t border-white/5 pt-6 mt-8'>
        <span className='text-[10px] text-zinc-500 font-medium'>Manual expenses align ledger profits with offline acquisitions.</span>
        <Link href='/admin/revenue' className='text-xs font-black uppercase tracking-wider text-gold hover:underline'>
          ← Back To Revenue
        </Link>
      </div>
    </DashboardShell>
  );
}

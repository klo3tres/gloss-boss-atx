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

  const [ledgerRes, paymentsRes, refundsRes, payoutsRes] = await Promise.all([
    admin.from('financial_ledger').select('*').eq('source', 'stripe').order('created_at', { ascending: false }).limit(20),
    admin.from('payments').select('*').eq('payment_method', 'stripe').order('created_at', { ascending: false }).limit(10),
    admin.from('financial_ledger').select('*').eq('type', 'refund').order('occurred_at', { ascending: false }).limit(10),
    admin.from('financial_ledger').select('*').eq('type', 'payout').order('occurred_at', { ascending: false }).limit(10),
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

  return (
    <DashboardShell title='Stripe sync' subtitle='Payments, fees, refunds, payouts, and Stripe balance status.' role='admin'>
      <section className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <div className='rounded-2xl border border-white/10 bg-black/40 p-5'><p className='text-xs uppercase text-zinc-500'>Last successful Stripe sync</p><p className='mt-2 text-sm font-bold text-white'>{fmt(latestLedger?.created_at)}</p></div>
        <div className='rounded-2xl border border-white/10 bg-black/40 p-5'><p className='text-xs uppercase text-zinc-500'>Payment available balance</p><p className='mt-2 text-2xl font-black text-white'>{stripeSnapshot?.paymentAvailableCents == null ? 'Unavailable' : displayMoney(stripeSnapshot.paymentAvailableCents)}</p></div>
        <div className='rounded-2xl border border-white/10 bg-black/40 p-5'><p className='text-xs uppercase text-zinc-500'>Payment pending balance</p><p className='mt-2 text-2xl font-black text-white'>{stripeSnapshot?.paymentPendingCents == null ? 'Unavailable' : displayMoney(stripeSnapshot.paymentPendingCents)}</p></div>
        <a href='https://dashboard.stripe.com/' target='_blank' rel='noreferrer' className='rounded-2xl border border-gold/20 bg-gold/10 p-5 text-sm font-black uppercase text-gold-soft'>Open Stripe Dashboard</a>
      </section>

      <section className='grid gap-3 sm:grid-cols-2'>
        <div className='rounded-2xl border border-white/10 bg-black/40 p-5'>
          <p className='text-xs uppercase text-zinc-500'>Treasury / financial account balance</p>
          <p className='mt-2 text-2xl font-black text-white'>{stripeSnapshot?.treasuryAvailableCents == null ? 'Unavailable' : displayMoney(stripeSnapshot.treasuryAvailableCents)}</p>
          {stripeSnapshot?.treasuryUnavailableReason ? <p className='mt-2 text-xs text-amber-200'>{stripeSnapshot.treasuryUnavailableReason}</p> : null}
        </div>
        <div className='rounded-2xl border border-white/10 bg-black/40 p-5'>
          <p className='text-xs uppercase text-zinc-500'>Stripe card / issuing spend</p>
          <p className='mt-2 text-2xl font-black text-white'>{displayMoney(Math.abs((stripeSnapshot?.recentCardSpends ?? []).reduce((s, r) => s + r.amount, 0)))}</p>
          {stripeSnapshot?.issuingUnavailableReason ? <p className='mt-2 text-xs text-amber-200'>{stripeSnapshot.issuingUnavailableReason}</p> : null}
        </div>
      </section>

      <form action={resyncStripeTransactionsAction} className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <button className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Resync Stripe transactions</button>
        <p className='mt-2 text-xs text-zinc-500'>Imports the latest 100 Stripe balance transactions into the financial ledger.</p>
      </form>

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

      <section className='grid gap-4 lg:grid-cols-2'>
        <div className='rounded-2xl border border-white/10 bg-black/35 p-5'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Recent Stripe payments</p>
          <ul className='mt-3 space-y-2 text-xs text-zinc-300'>
            {(paymentsRes.data ?? []).map((p: any) => <li key={p.id} className='rounded border border-white/10 px-3 py-2'>{displayMoney(p.amount_cents ?? 0)} - {p.status} - {fmt(p.created_at)}</li>)}
            {(stripeSnapshot?.recentPayments ?? []).map((p) => <li key={p.id} className='rounded border border-white/10 px-3 py-2'>{displayMoney(p.amount)} - {p.status} - {fmt(new Date(p.created * 1000).toISOString())}</li>)}
          </ul>
        </div>
        <div className='rounded-2xl border border-white/10 bg-black/35 p-5'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Recent Stripe fees/refunds/payouts</p>
          <ul className='mt-3 space-y-2 text-xs text-zinc-300'>
            {[...(ledgerRes.data ?? []), ...(refundsRes.data ?? []), ...(payoutsRes.data ?? [])].slice(0, 12).map((r: any) => (
              <li key={r.id} className='rounded border border-white/10 px-3 py-2'>{r.type} - {displayMoney(r.net_amount ?? r.amount ?? 0)} - {fmt(r.occurred_at)}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className='grid gap-4 lg:grid-cols-2'>
        <div className='rounded-2xl border border-white/10 bg-black/35 p-5'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Recent transfers</p>
          <ul className='mt-3 space-y-2 text-xs text-zinc-300'>
            {(stripeSnapshot?.recentTransfers ?? []).map((t) => <li key={t.id} className='rounded border border-white/10 px-3 py-2'>{displayMoney(t.amount)} - {t.description ?? t.destination ?? 'Transfer'} - {fmt(new Date(t.created * 1000).toISOString())}</li>)}
            {(stripeSnapshot?.recentTransfers ?? []).length === 0 ? <li className='text-zinc-500'>No recent transfers returned by Stripe API.</li> : null}
          </ul>
        </div>
        <div className='rounded-2xl border border-white/10 bg-black/35 p-5'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Recent card spends / issuing</p>
          <ul className='mt-3 space-y-2 text-xs text-zinc-300'>
            {(stripeSnapshot?.recentCardSpends ?? []).map((t) => <li key={t.id} className='rounded border border-white/10 px-3 py-2'>{displayMoney(t.amount)} - {t.merchant ?? 'Card spend'} - {fmt(new Date(t.created * 1000).toISOString())}</li>)}
            {(stripeSnapshot?.recentCardSpends ?? []).length === 0 ? <li className='text-zinc-500'>No card spend rows returned, or Stripe Issuing access is unavailable.</li> : null}
          </ul>
        </div>
      </section>

      <p className='text-xs text-zinc-500'>If Treasury or Issuing is not enabled on the API key, use manual expenses in Operations so net profit still stays accurate.</p>
      <Link href='/admin/revenue' className='text-xs font-bold uppercase text-gold-soft underline'>Back to revenue</Link>
    </DashboardShell>
  );
}

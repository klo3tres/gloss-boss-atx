import Link from 'next/link';
import { notFound } from 'next/navigation';
import Stripe from 'stripe';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { displayMoney } from '@/lib/display-format';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resyncStripeTransactionsAction } from './actions';

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

  let pending: number | null = null;
  let available: number | null = null;
  const secrets = await getStripeSecrets(admin);
  if (secrets.secretKey) {
    try {
      const stripe = new Stripe(secrets.secretKey);
      const balance = await stripe.balance.retrieve();
      pending = balance.pending.reduce((s, b) => s + b.amount, 0);
      available = balance.available.reduce((s, b) => s + b.amount, 0);
    } catch {
      pending = null;
      available = null;
    }
  }

  const latestLedger = ledgerRes.data?.[0] as Record<string, unknown> | undefined;

  return (
    <DashboardShell title='Stripe sync' subtitle='Payments, fees, refunds, payouts, and Stripe balance status.' role='admin'>
      <section className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <div className='rounded-2xl border border-white/10 bg-black/40 p-5'><p className='text-xs uppercase text-zinc-500'>Last successful Stripe sync</p><p className='mt-2 text-sm font-bold text-white'>{fmt(latestLedger?.created_at)}</p></div>
        <div className='rounded-2xl border border-white/10 bg-black/40 p-5'><p className='text-xs uppercase text-zinc-500'>Available Stripe balance</p><p className='mt-2 text-2xl font-black text-white'>{available == null ? 'Unavailable' : displayMoney(available)}</p></div>
        <div className='rounded-2xl border border-white/10 bg-black/40 p-5'><p className='text-xs uppercase text-zinc-500'>Pending Stripe balance</p><p className='mt-2 text-2xl font-black text-white'>{pending == null ? 'Unavailable' : displayMoney(pending)}</p></div>
        <a href='https://dashboard.stripe.com/' target='_blank' rel='noreferrer' className='rounded-2xl border border-gold/20 bg-gold/10 p-5 text-sm font-black uppercase text-gold-soft'>Open Stripe Dashboard</a>
      </section>

      <form action={resyncStripeTransactionsAction} className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <button className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Resync Stripe transactions</button>
        <p className='mt-2 text-xs text-zinc-500'>Imports the latest 100 Stripe balance transactions into the financial ledger.</p>
      </form>

      <section className='grid gap-4 lg:grid-cols-2'>
        <div className='rounded-2xl border border-white/10 bg-black/35 p-5'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Recent Stripe payments</p>
          <ul className='mt-3 space-y-2 text-xs text-zinc-300'>
            {(paymentsRes.data ?? []).map((p: any) => <li key={p.id} className='rounded border border-white/10 px-3 py-2'>{displayMoney(p.amount_cents ?? 0)} - {p.status} - {fmt(p.created_at)}</li>)}
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

      <p className='text-xs text-zinc-500'>Stripe card/issuing transactions will appear here once Stripe exposes them to this account and they are synced into the ledger.</p>
      <Link href='/admin/revenue' className='text-xs font-bold uppercase text-gold-soft underline'>Back to revenue</Link>
    </DashboardShell>
  );
}

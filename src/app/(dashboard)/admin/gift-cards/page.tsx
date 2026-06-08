import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

type GiftCardRow = {
  id: string;
  code: string;
  purchaser_name: string | null;
  purchaser_email: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  original_balance_cents: number;
  current_balance_cents: number;
  status: string;
  created_at: string;
  notes: string | null;
};

function money(cents: number | null | undefined) {
  return `$${((Number(cents ?? 0) || 0) / 100).toFixed(2)}`;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Unknown';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function AdminGiftCardsPage() {
  const admin = tryCreateAdminSupabase();
  let rows: GiftCardRow[] = [];
  let error: string | null = null;

  if (!admin) {
    error = 'SUPABASE_SERVICE_ROLE_KEY missing. Gift card ledger requires the service-role client.';
  } else {
    const res = await admin
      .from('gift_cards')
      .select('id, code, purchaser_name, purchaser_email, recipient_name, recipient_email, original_balance_cents, current_balance_cents, status, created_at, notes')
      .order('created_at', { ascending: false })
      .limit(100);
    if (res.error) error = res.error.message;
    else rows = (res.data ?? []) as GiftCardRow[];
  }

  const active = rows.filter((row) => row.status === 'active');
  const outstandingCents = active.reduce((sum, row) => sum + (Number(row.current_balance_cents) || 0), 0);
  const soldCents = rows.reduce((sum, row) => sum + (Number(row.original_balance_cents) || 0), 0);

  return (
    <DashboardShell title='Gift cards' subtitle='Sold cards, open balances, and Stripe checkout tracking.' role='admin'>
      {error ? (
        <p className='rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100'>
          {error}. Run the latest Supabase migration if the gift_cards table is missing.
        </p>
      ) : null}

      <div className='grid gap-3 md:grid-cols-3'>
        {[
          { label: 'Cards sold', value: String(rows.length) },
          { label: 'Total sold', value: money(soldCents) },
          { label: 'Outstanding balance', value: money(outstandingCents) },
        ].map((card) => (
          <div key={card.label} className='rounded-2xl border border-gold/20 bg-zinc-950 p-4'>
            <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>{card.label}</p>
            <p className='mt-2 text-2xl font-black text-white'>{card.value}</p>
          </div>
        ))}
      </div>

      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Gift card ledger</p>
            <p className='mt-1 text-sm text-zinc-400'>Successful public checkout sessions appear here automatically.</p>
          </div>
          <Link href='/gift-cards' className='rounded-xl border border-gold/40 px-4 py-2 text-xs font-black uppercase text-gold-soft'>
            Public sales page
          </Link>
        </div>

        <div className='mt-5 overflow-x-auto'>
          <table className='w-full min-w-[760px] text-left text-sm'>
            <thead className='text-[10px] uppercase tracking-[0.18em] text-zinc-500'>
              <tr>
                <th className='border-b border-white/10 py-3'>Code</th>
                <th className='border-b border-white/10 py-3'>Buyer</th>
                <th className='border-b border-white/10 py-3'>Recipient</th>
                <th className='border-b border-white/10 py-3'>Original</th>
                <th className='border-b border-white/10 py-3'>Balance</th>
                <th className='border-b border-white/10 py-3'>Status</th>
                <th className='border-b border-white/10 py-3'>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className='border-b border-white/5 align-top'>
                  <td className='py-3 font-mono text-gold-soft'>{row.code}</td>
                  <td className='py-3 text-zinc-200'>
                    <p>{row.purchaser_name ?? 'Buyer'}</p>
                    <p className='text-xs text-zinc-500'>{row.purchaser_email ?? 'No email'}</p>
                  </td>
                  <td className='py-3 text-zinc-300'>
                    <p>{row.recipient_name ?? '-'}</p>
                    <p className='text-xs text-zinc-500'>{row.recipient_email ?? ''}</p>
                  </td>
                  <td className='py-3 font-semibold text-white'>{money(row.original_balance_cents)}</td>
                  <td className='py-3 font-semibold text-white'>{money(row.current_balance_cents)}</td>
                  <td className='py-3'>
                    <span className='rounded-full border border-white/10 bg-black px-2 py-1 text-[10px] font-black uppercase text-zinc-300'>
                      {row.status}
                    </span>
                  </td>
                  <td className='py-3 text-xs text-zinc-400'>{dateLabel(row.created_at)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className='py-8 text-center text-sm text-zinc-500'>
                    No gift cards recorded yet. Completed Stripe gift-card checkouts will appear here.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}

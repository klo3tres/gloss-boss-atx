import Link from 'next/link';
import { CreditCard, ExternalLink, Fuel, ReceiptText, ShieldCheck } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { GlassCard, PremiumBadge, SectionEyebrow } from '@/components/ui/premium';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { displayMoney } from '@/lib/display-format';
import { getFinancialSnapshot, type FinancialDetailRow } from '@/lib/financial-ledger';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

function isCardSpendRow(row: Record<string, unknown>) {
  const type = String(row.type ?? '').toLowerCase();
  const category = String(row.category ?? '').toLowerCase();
  const source = String(row.source ?? '').toLowerCase();
  return (
    type === 'expense' &&
    (Boolean(row.stripe_issuing_transaction_id) ||
      category.includes('issuing') ||
      category.includes('card') ||
      source.includes('stripe'))
  );
}

function cardSpendDetail(row: Record<string, unknown>): FinancialDetailRow {
  const metadata = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as {
    merchant_name?: string;
    merchant_data?: { name?: string };
  };
  return {
    id: String(row.id ?? row.stripe_issuing_transaction_id ?? row.occurred_at ?? Math.random()),
    label:
      metadata.merchant_name?.trim() ||
      metadata.merchant_data?.name?.trim() ||
      String(row.description ?? row.category ?? 'Card spend'),
    amountCents: Math.abs(Number(row.amount ?? row.gross_amount ?? 0)),
    occurredAt: typeof row.occurred_at === 'string' ? row.occurred_at : null,
    source: String(row.source ?? 'stripe'),
    category: String(row.category ?? 'card_spend'),
    method: row.stripe_issuing_transaction_id ? 'Stripe Issuing' : 'Card / expense',
    href: '/admin/card-activity',
  };
}

export default async function AdminCardActivityPage() {
  const session = await getSessionWithProfile();
  const canView = session.user && isAdminLevel(session.profile?.role ?? null);
  const admin = canView ? tryCreateAdminSupabase() : null;
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 30);
  start.setHours(0, 0, 0, 0);

  let cardRows: FinancialDetailRow[] = [];
  let manualExpenseRows: FinancialDetailRow[] = [];
  let snapshotTotals = {
    expensesCents: 0,
    netProfitCents: 0,
    grossRevenueCents: 0,
  };
  let setupNotice = 'Connect Stripe Issuing/Treasury or run Stripe Sync to populate live card spend.';

  if (admin) {
    const [ledgerRes, financial] = await Promise.all([
      admin
        .from('financial_ledger')
        .select('*')
        .gte('occurred_at', start.toISOString())
        .lte('occurred_at', now.toISOString())
        .order('occurred_at', { ascending: false })
        .limit(200),
      getFinancialSnapshot(admin, {
        startDate: start.toISOString(),
        endDate: now.toISOString(),
        includeTest: false,
      }).catch(() => null),
    ]);

    const ledgerRows = ((ledgerRes.data ?? []) as Record<string, unknown>[]).filter((row) => row.exclude_from_reports !== true);
    cardRows = ledgerRows.filter(isCardSpendRow).map(cardSpendDetail);
    manualExpenseRows = financial?.recentExpenses ?? [];
    snapshotTotals = {
      expensesCents: financial?.expensesCents ?? 0,
      netProfitCents: financial?.netProfitCents ?? 0,
      grossRevenueCents: financial?.grossRevenueCents ?? 0,
    };
    if (cardRows.length > 0) setupNotice = 'Stripe card spend is syncing from the financial ledger.';
  }

  const cardSpendCents = cardRows.reduce((sum, row) => sum + Math.abs(row.amountCents), 0);
  const manualExpenseCents = manualExpenseRows.reduce((sum, row) => sum + Math.abs(row.amountCents), 0);

  return (
    <DashboardShell title="Card activity" subtitle="Stripe card spend, manual expenses, and finance setup." role="admin">
      {!canView ? (
        <GlassCard className="p-6 text-sm text-zinc-300">Admin access is required.</GlassCard>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-4">
            <GlassCard className="p-5">
              <SectionEyebrow>Stripe Card Spend</SectionEyebrow>
              <p className="mt-3 font-mono text-3xl font-black text-cyan-300">{displayMoney(cardSpendCents)}</p>
              <p className="mt-1 text-xs text-zinc-500">Last 30 days</p>
            </GlassCard>
            <GlassCard className="p-5">
              <SectionEyebrow>Manual Expenses</SectionEyebrow>
              <p className="mt-3 font-mono text-3xl font-black text-white">{displayMoney(manualExpenseCents)}</p>
              <p className="mt-1 text-xs text-zinc-500">Operations, fuel, supplies</p>
            </GlassCard>
            <GlassCard className="p-5">
              <SectionEyebrow>Total Expenses</SectionEyebrow>
              <p className="mt-3 font-mono text-3xl font-black text-rose-300">{displayMoney(snapshotTotals.expensesCents)}</p>
              <p className="mt-1 text-xs text-zinc-500">Ledger + manual rows</p>
            </GlassCard>
            <GlassCard className="p-5">
              <SectionEyebrow>Revenue Context</SectionEyebrow>
              <p className="mt-3 font-mono text-3xl font-black text-gold-soft">{displayMoney(snapshotTotals.netProfitCents)}</p>
              <p className="mt-1 text-xs text-zinc-500">Net after current expense rows</p>
            </GlassCard>
          </section>

          <GlassCard className="p-5">
            <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <SectionEyebrow>Issuing / Treasury Status</SectionEyebrow>
                <p className="mt-2 text-sm text-zinc-300">{setupNotice}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/admin/stripe-sync" className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-[10px] font-black uppercase text-cyan-100 hover:bg-cyan-400/20">
                  Run Stripe Sync
                </Link>
                <Link href="/admin/operations" className="rounded-xl border border-gold/25 bg-gold/10 px-4 py-2 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/20">
                  Add Manual Expense
                </Link>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
                <p className="mt-3 text-xs font-bold uppercase text-white">No Error Spam</p>
                <p className="mt-1 text-xs text-zinc-500">Unavailable Stripe products are treated as setup state, not dashboard failures.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <CreditCard className="h-5 w-5 text-cyan-300" />
                <p className="mt-3 text-xs font-bold uppercase text-white">Card Spend</p>
                <p className="mt-1 text-xs text-zinc-500">Rows come from `financial_ledger` Stripe/Issuing expense entries.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <Fuel className="h-5 w-5 text-gold-soft" />
                <p className="mt-3 text-xs font-bold uppercase text-white">Fallback Entry</p>
                <p className="mt-1 text-xs text-zinc-500">Fuel, supplies, and reimbursements still work through Operations.</p>
              </div>
            </div>
          </GlassCard>

          <section className="grid gap-6 lg:grid-cols-2">
            <GlassCard className="p-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <SectionEyebrow>Synced Card Spend</SectionEyebrow>
                <PremiumBadge tone={cardRows.length > 0 ? 'emerald' : 'amber'}>{cardRows.length} rows</PremiumBadge>
              </div>
              <div className="mt-4 space-y-3">
                {cardRows.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
                    No Stripe card spend rows are available yet.
                  </p>
                ) : (
                  cardRows.map((row) => (
                    <div key={row.id} className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-bold text-white">{row.label}</p>
                          <p className="mt-1 text-xs text-zinc-500">{row.category} · {row.occurredAt ? new Date(row.occurredAt).toLocaleString() : 'No date'}</p>
                        </div>
                        <p className="font-mono font-black text-cyan-200">{displayMoney(row.amountCents)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <SectionEyebrow>Manual Expense Rows</SectionEyebrow>
                <Link href="/admin/operations" className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-gold-soft hover:underline">
                  Manage <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="mt-4 space-y-3">
                {manualExpenseRows.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
                    No manual expenses found in this range.
                  </p>
                ) : (
                  manualExpenseRows.slice(0, 25).map((row) => (
                    <div key={`${row.source}:${row.id}`} className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-bold text-white">{row.label}</p>
                          <p className="mt-1 text-xs text-zinc-500">{row.source} · {row.occurredAt ? new Date(row.occurredAt).toLocaleString() : 'No date'}</p>
                        </div>
                        <p className="font-mono font-black text-white">{displayMoney(row.amountCents)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
          </section>
        </div>
      )}
    </DashboardShell>
  );
}

import Link from 'next/link';
import { 
  CreditCard, 
  ExternalLink, 
  Fuel, 
  ReceiptText, 
  ShieldCheck,
  TrendingDown,
  DollarSign,
  Layers,
  ArrowLeft,
  Activity,
  Zap,
  Clock,
  Sparkles,
  Info,
  ChevronRight,
  Plus
} from 'lucide-react';
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

  const getCategoryIcon = (category: string | null | undefined) => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('fuel') || cat.includes('gas')) return <Fuel className="h-4 w-4 text-amber-400" />;
    if (cat.includes('card') || cat.includes('issuing')) return <CreditCard className="h-4 w-4 text-cyan-400" />;
    return <Layers className="h-4 w-4 text-zinc-400" />;
  };

  return (
    <DashboardShell title="Card Activity & Expenses" subtitle="Stripe issuing, corporate card metrics, and manual business logs." role="admin">
      {!canView ? (
        <GlassCard className="p-6 text-sm text-zinc-400">Admin credentials required to view ledger details.</GlassCard>
      ) : (
        <div className="space-y-6">
          {/* Executive metrics cards */}
          <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Stripe Card Spend', val: cardSpendCents, desc: 'Corporate cards', color: 'text-cyan-300' },
              { label: 'Manual Expenses', val: manualExpenseCents, desc: 'Supplies, fuel, gas', color: 'text-zinc-200' },
              { label: 'Total Business Costs', val: snapshotTotals.expensesCents, desc: 'Ledger + manual logs', color: 'text-rose-400' },
              { label: 'Net Profit Margin', val: snapshotTotals.netProfitCents, desc: 'After expenses logic', color: 'text-gold-soft' },
            ].map((s, idx) => (
              <div key={idx} className="bg-zinc-950/60 border border-white/5 p-4.5 rounded-3xl backdrop-blur-md relative overflow-hidden group hover:border-gold/20 transition-all duration-300">
                <div className="absolute top-0 right-0 p-3 opacity-5">
                  <Activity className="h-10 w-10 text-gold" />
                </div>
                <p className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">{s.label}</p>
                <p className={`text-xl font-black mt-1 font-mono ${s.color}`}>
                  {displayMoney(s.val)}
                </p>
                <p className="text-[10px] text-zinc-400 mt-1">{s.desc}</p>
              </div>
            ))}
          </section>

          {/* Sync operations control center */}
          <GlassCard className="p-6">
            <div className="flex flex-col gap-4 border-b border-white/5 pb-5 md:flex-row md:items-center md:justify-between">
              <div>
                <SectionEyebrow>Corporate Treasury Integrations</SectionEyebrow>
                <p className="mt-1.5 text-xs text-zinc-400">{setupNotice}</p>
              </div>
              
              <div className="flex flex-wrap gap-2.5">
                <Link href="/admin/stripe-sync" className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2.5 text-[10px] font-black uppercase text-cyan-300 hover:bg-cyan-500/20 transition tracking-wider">
                  Sync Stripe Ledger
                </Link>
                <Link href="/admin/operations" className="flex items-center gap-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-black bg-gold hover:bg-gold-soft px-4 py-2.5 transition duration-300">
                  <Plus className="h-3.5 w-3.5 stroke-[3]" /> Manual Expense
                </Link>
              </div>
            </div>

            {/* Checklist */}
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {[
                { title: 'Webhook Sync', desc: 'Unavailable Stripe API products are bypassed safely to prevent downtime.', icon: <ShieldCheck className="h-5 w-5 text-emerald-400" /> },
                { title: 'Ledger Audit', desc: 'Sync fetches core card spend from financial_ledger issuing entries.', icon: <CreditCard className="h-5 w-5 text-cyan-400" /> },
                { title: 'Fallback Reconciliation', desc: 'Reimbursements, chemical logs, and fuel audits are run manually.', icon: <Fuel className="h-5 w-5 text-gold-soft" /> }
              ].map((item, idx) => (
                <div key={idx} className="rounded-2xl border border-white/5 bg-black/45 p-4 hover:border-white/10 transition">
                  {item.icon}
                  <p className="mt-3.5 text-xs font-black uppercase text-white tracking-wider">{item.title}</p>
                  <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Synced Card Spend and Manual Expense Side-by-Side Grid */}
          <section className="grid gap-6 lg:grid-cols-2">
            {/* Sync Spend */}
            <GlassCard className="p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
                  <SectionEyebrow>Synced Card Transactions</SectionEyebrow>
                  <span className="rounded-full bg-cyan-500/10 border border-cyan-500/25 px-2.5 py-0.5 text-[10px] font-black uppercase text-cyan-300 font-mono">
                    {cardRows.length} transactions
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-900">
                  {cardRows.length === 0 ? (
                    <div className="py-16 text-center border border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center">
                      <CreditCard className="h-6 w-6 text-zinc-800 mb-1" />
                      <p className="text-[10px] text-zinc-600 uppercase font-black tracking-wider">No Card Spend Synced</p>
                    </div>
                  ) : (
                    cardRows.map((row) => (
                      <div key={row.id} className="rounded-2xl border border-white/5 bg-zinc-900/35 p-4 hover:border-white/10 transition duration-200">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="mt-0.5 p-1.5 bg-black/40 border border-white/5 rounded-lg">
                              {getCategoryIcon(row.category)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-white text-xs truncate">{row.label}</p>
                              <p className="mt-1 text-[10px] text-zinc-500 font-mono">
                                {row.category} · {row.occurredAt ? new Date(row.occurredAt).toLocaleString() : 'No date'}
                              </p>
                            </div>
                          </div>
                          <p className="font-mono font-black text-cyan-300 shrink-0">{displayMoney(row.amountCents)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>

            {/* Manual expenses */}
            <GlassCard className="p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
                  <SectionEyebrow>Manual Expense Ledgers</SectionEyebrow>
                  <Link href="/admin/operations" className="text-[10px] font-black uppercase text-gold-soft hover:underline">
                    Reconcile Board →
                  </Link>
                </div>

                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-900">
                  {manualExpenseRows.length === 0 ? (
                    <div className="py-16 text-center border border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center">
                      <Fuel className="h-6 w-6 text-zinc-800 mb-1" />
                      <p className="text-[10px] text-zinc-600 uppercase font-black tracking-wider">No Manual Expenses</p>
                    </div>
                  ) : (
                    manualExpenseRows.slice(0, 30).map((row) => (
                      <div key={`${row.source}:${row.id}`} className="rounded-2xl border border-white/5 bg-zinc-900/35 p-4 hover:border-white/10 transition duration-200">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="mt-0.5 p-1.5 bg-black/40 border border-white/5 rounded-lg">
                              {getCategoryIcon(row.category)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-white text-xs truncate">{row.label}</p>
                              <p className="mt-1 text-[10px] text-zinc-500 font-mono">
                                {row.source} · {row.occurredAt ? new Date(row.occurredAt).toLocaleString() : 'No date'}
                              </p>
                            </div>
                          </div>
                          <p className="font-mono font-black text-rose-300 shrink-0">{displayMoney(row.amountCents)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          </section>
        </div>
      )}

      {/* Footer Return Link */}
      <div className="pt-4 border-t border-white/5">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-gold-soft hover:underline tracking-wider">
          <ArrowLeft className="h-4 w-4" /> Return to Dashboard
        </Link>
      </div>
    </DashboardShell>
  );
}

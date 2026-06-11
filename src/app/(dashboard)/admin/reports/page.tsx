import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { displayMoney } from '@/lib/display-format';
import { getFinancialSnapshot } from '@/lib/financial-ledger';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { GlassCard, PremiumBadge, SectionEyebrow, CollapsibleSection } from '@/components/ui/premium';
import { Calendar, Download, Eye, TrendingUp, DollarSign, Clock, FileSpreadsheet, ArrowLeft, ArrowUpRight, ShieldAlert } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const sp = searchParams ? await searchParams : {};
  const from = String(sp.from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const to = String(sp.to ?? new Date().toISOString().slice(0, 10));
  const includeTest = sp.includeTest === '1';
  const fromIso = new Date(`${from}T00:00:00`).toISOString();
  const toIso = new Date(`${to}T23:59:59`).toISOString();
  const summary = await getFinancialSnapshot(admin, { startDate: fromIso, endDate: toIso, includeTest });

  const [reportOutstanding, reportIssued, reportRedeemed, reportExpired, reportVoided] = await Promise.all([
    admin.from('customer_credits').select('remaining_cents').in('status', ['active', 'partially_used']),
    admin.from('customer_credits').select('amount_cents').gte('issued_at', fromIso).lte('issued_at', toIso).neq('status', 'voided'),
    admin.from('customer_credit_redemptions').select('amount_cents').gte('redeemed_at', fromIso).lte('redeemed_at', toIso),
    admin.from('customer_credits').select('remaining_cents').gte('expires_at', fromIso).lte('expires_at', toIso).eq('status', 'expired'),
    admin.from('customer_credits').select('amount_cents').gte('created_at', fromIso).lte('created_at', toIso).eq('status', 'voided'),
  ]);

  const outstandingTotalCents = (reportOutstanding.data ?? []).reduce((sum, c) => sum + (c.remaining_cents ?? 0), 0);
  const issuedTotalCents = (reportIssued.data ?? []).reduce((sum, c) => sum + (c.amount_cents ?? 0), 0);
  const redeemedTotalCents = (reportRedeemed.data ?? []).reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);
  const expiredTotalCents = (reportExpired.data ?? []).reduce((sum, c) => sum + (c.remaining_cents ?? 0), 0);
  const voidedTotalCents = (reportVoided.data ?? []).reduce((sum, c) => sum + (c.amount_cents ?? 0), 0);

  const qs = `from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}${includeTest ? '&includeTest=1' : ''}`;

  const reports = [
    ['Revenue Report', 'revenue', 'Monthly gross, payouts, and Zelle'],
    ['Expense Report', 'expenses', 'Rig operations, gas, and supplies'],
    ['Profit & Loss Report', 'revenue', 'Reconciled ledger net margins'],
    ['Stripe Reconciliation', 'revenue', 'Stripe sync database audit'],
    ['Work Order Revenue', 'payments', 'Aggregated invoice items'],
    ['Payment History Log', 'payments', 'Standard booking checkouts'],
    ['Membership Subscriptions', 'memberships', 'Recurring Bronze/Silver/Gold'],
  ];

  return (
    <DashboardShell title="Financial Reports" subtitle="Generate reconciled tax-time reports with active date filters and ledger snapshots." role="admin">
      
      {/* FILTER PANEL */}
      <GlassCard className="print:hidden border-white/10 bg-zinc-950/40">
        <form className="grid gap-4 sm:grid-cols-4 items-end">
          <label className="block text-xs font-bold text-zinc-400">
            From Date
            <input 
              name="from" 
              type="date" 
              defaultValue={from} 
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3.5 py-2.5 text-xs text-white focus:border-gold/50 outline-none transition" 
            />
          </label>
          <label className="block text-xs font-bold text-zinc-400">
            To Date
            <input 
              name="to" 
              type="date" 
              defaultValue={to} 
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3.5 py-2.5 text-xs text-white focus:border-gold/50 outline-none transition" 
            />
          </label>
          
          <div className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-black/30 px-3.5 py-3 h-[42px] mb-[1px]">
            <input 
              type="checkbox" 
              name="includeTest" 
              id="include-test-check"
              value="1" 
              defaultChecked={includeTest} 
              className="h-4 w-4 accent-gold cursor-pointer" 
            />
            <label htmlFor="include-test-check" className="text-xs font-bold text-zinc-300 cursor-pointer">
              Include Test Data
            </label>
          </div>

          <button className="rounded-xl bg-gold px-6 py-3 text-xs font-black uppercase tracking-widest text-black hover:brightness-110 transition duration-200">
            Apply Date Range
          </button>
        </form>
      </GlassCard>

      {/* CORE FINANCIAL INDICATORS */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/45 p-5 relative overflow-hidden">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Gross Collected</span>
          <p className="mt-3 font-mono text-2.5xl font-black text-white">{displayMoney(summary.grossRevenueCents)}</p>
          <p className="mt-1.5 text-[9px] text-zinc-500 font-bold">{summary.paymentsCount} payments · {summary.receiptsCount} receipts</p>
          <div className="absolute top-4 right-4 text-emerald-400 opacity-60"><DollarSign className="h-4 w-4" /></div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/45 p-5 relative overflow-hidden">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Refunds & Fees</span>
          <p className="mt-3 font-mono text-2.5xl font-black text-white">{displayMoney(summary.refundsCents + summary.stripeFeesCents)}</p>
          <p className="mt-1.5 text-[9px] text-zinc-500 font-bold">Stripe processing & deposits</p>
          <div className="absolute top-4 right-4 text-zinc-500 opacity-60"><Clock className="h-4 w-4" /></div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/45 p-5 relative overflow-hidden">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Total Expenses</span>
          <p className="mt-3 font-mono text-2.5xl font-black text-rose-300">{displayMoney(summary.expensesCents)}</p>
          <p className="mt-1.5 text-[9px] text-zinc-500 font-bold">Rig travel & field supplies</p>
          <div className="absolute top-4 right-4 text-rose-300 opacity-60"><TrendingUp className="h-4 w-4" /></div>
        </div>
        <div className="rounded-2xl border border-gold/25 bg-black/45 p-5 relative overflow-hidden shadow-[0_0_20px_rgba(212,175,55,0.04)]">
          <span className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Net Profit Margin</span>
          <p className="mt-3 font-mono text-2.5xl font-black text-gold-soft">{displayMoney(summary.netProfitCents)}</p>
          <p className="mt-1.5 text-[9px] text-zinc-500 font-bold">Ledger surplus reconciled</p>
          <div className="absolute top-4 right-4 text-gold-soft opacity-60"><TrendingUp className="h-4 w-4" /></div>
        </div>
      </section>

      {/* LIABILITY MATRIX */}
      <GlassCard className="border-gold/15 bg-zinc-950/30">
        <SectionEyebrow>Credit Liability & Ledger Summary</SectionEyebrow>
        <p className="text-xs text-zinc-500 mt-1 mb-4">Reconciled outstanding store credits vs current period allocations.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-white/5 bg-black/25 p-4">
            <span className="text-[9px] uppercase text-zinc-500 font-bold">Outstanding Liability</span>
            <p className="mt-2 font-mono text-lg font-black text-rose-300">{displayMoney(outstandingTotalCents)}</p>
            <p className="mt-1 text-[8px] text-zinc-500 leading-tight">Global active credit ledger</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-black/25 p-4">
            <span className="text-[9px] uppercase text-zinc-500 font-bold">Issued in Period</span>
            <p className="mt-2 font-mono text-lg font-black text-white">{displayMoney(issuedTotalCents)}</p>
            <p className="mt-1 text-[8px] text-zinc-500 leading-tight">Credits issued in range</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-black/25 p-4">
            <span className="text-[9px] uppercase text-zinc-500 font-bold">Redeemed in Period</span>
            <p className="mt-2 font-mono text-lg font-black text-emerald-300">{displayMoney(redeemedTotalCents)}</p>
            <p className="mt-1 text-[8px] text-zinc-500 leading-tight">Credits redeemed in range</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-black/25 p-4">
            <span className="text-[9px] uppercase text-zinc-500 font-bold">Expired in Period</span>
            <p className="mt-2 font-mono text-lg font-black text-amber-200">{displayMoney(expiredTotalCents)}</p>
            <p className="mt-1 text-[8px] text-zinc-500 leading-tight">Expired credits in range</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-black/25 p-4">
            <span className="text-[9px] uppercase text-zinc-500 font-bold">Voided in Period</span>
            <p className="mt-2 font-mono text-lg font-black text-zinc-400">{displayMoney(voidedTotalCents)}</p>
            <p className="mt-1 text-[8px] text-zinc-500 leading-tight">Voided credits in range</p>
          </div>
        </div>
      </GlassCard>

      {/* DETAILED LEDGER GRID */}
      <section className="grid gap-6 lg:grid-cols-2">
        <GlassCard className="border-white/10 bg-zinc-950/40">
          <SectionEyebrow className="mb-4">Recent Reconciled Payments</SectionEyebrow>
          {summary.recentPayments.length === 0 ? (
            <p className="text-xs text-zinc-500 italic py-6 text-center">No payment transactions on record for this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead>
                  <tr className="border-b border-white/10 font-bold uppercase text-[9px] text-zinc-500 pb-2">
                    <th className="pb-2">Source / Label</th>
                    <th className="pb-2">Method</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {summary.recentPayments.slice(0, 12).map((row) => (
                    <tr key={`${row.source}-${row.id}`} className="hover:bg-white/5">
                      <td className="py-2.5 font-bold text-white pr-2 truncate max-w-[200px]">{row.label}</td>
                      <td className="py-2.5 text-zinc-400 capitalize">{row.method ?? row.source}</td>
                      <td className="py-2.5 text-right font-mono font-bold text-gold-soft">{displayMoney(row.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        <GlassCard className="border-white/10 bg-zinc-950/40">
          <SectionEyebrow className="mb-4">Recent Reconciled Expenses</SectionEyebrow>
          {summary.recentExpenses.length === 0 ? (
            <p className="text-xs text-zinc-500 italic py-6 text-center">No expense logs on record for this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead>
                  <tr className="border-b border-white/10 font-bold uppercase text-[9px] text-zinc-500 pb-2">
                    <th className="pb-2">Supplier / Label</th>
                    <th className="pb-2">Source</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {summary.recentExpenses.slice(0, 12).map((row) => (
                    <tr key={`${row.source}-${row.id}`} className="hover:bg-white/5">
                      <td className="py-2.5 font-bold text-white pr-2 truncate max-w-[200px]">{row.label}</td>
                      <td className="py-2.5 text-zinc-400 capitalize">{row.source}</td>
                      <td className="py-2.5 text-right font-mono font-bold text-rose-300">{displayMoney(row.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </section>

      {/* CSV EXPORT DRAWER CARD */}
      <GlassCard className="border-gold/15 bg-zinc-950/40 space-y-4">
        <div>
          <SectionEyebrow>Report Export Console</SectionEyebrow>
          <p className="text-xs text-zinc-500 mt-1">Export specific ledger sheets to CSV format for accounting.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map(([label, report, desc]) => (
            <a 
              key={label} 
              href={`/api/admin/reports/export?report=${report}&${qs}`} 
              className="group rounded-2xl border border-white/5 bg-black/40 p-4 transition duration-300 hover:border-gold/30 hover:bg-black/60 flex items-center justify-between"
            >
              <div>
                <span className="font-bold text-xs text-white group-hover:text-gold-soft transition">{label}</span>
                <p className="text-[10px] text-zinc-500 mt-1">{desc}</p>
              </div>
              <Download className="h-4 w-4 text-zinc-500 group-hover:text-gold transition shrink-0 ml-3" />
            </a>
          ))}
        </div>
      </GlassCard>

      {/* COLLAPSIBLE DIAGNOSTICS & PRINT */}
      <CollapsibleSection title="Diagnostics & Print / PDF Summary" subtitle="Print tax ledger audits or check postgres row integrity warnings." defaultOpen={false}>
        <div className="space-y-4 text-xs">
          <div className="flex justify-between items-center bg-black/40 p-4 rounded-xl border border-white/5">
            <div>
              <p className="font-bold text-white">Tax Margin Calculation</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Gross Revenue - Refunds - Stripe Fees - Expenses = Net Profit</p>
              <p className="mt-2 font-mono text-zinc-300">
                {displayMoney(summary.grossRevenueCents)} - {displayMoney(summary.refundsCents)} - {displayMoney(summary.stripeFeesCents)} - {displayMoney(summary.expensesCents)} = {displayMoney(summary.netProfitCents)}
              </p>
            </div>
            <button 
              type="button" 
              onClick={() => window.print()} 
              className="rounded-xl bg-white/5 border border-white/10 hover:border-white/30 text-white px-4 py-2 font-bold uppercase tracking-wider text-[10px] transition shrink-0"
            >
              Print Reconciled PDF
            </button>
          </div>

          <div className="rounded-xl border border-white/5 bg-black/25 p-4 space-y-2">
            <span className="text-[10px] font-black uppercase text-gold-soft tracking-wider flex items-center gap-1.5"><ShieldAlert className="h-4 w-4" /> Integrity Report</span>
            <p className="text-zinc-400 font-medium">
              Rows Loaded: {summary.diagnostics.rowsLoaded} checkout transactions · {summary.diagnostics.ledgerRowsLoaded} reconciled ledger entries · {summary.diagnostics.expenseRowsLoaded} supply expenses · {summary.diagnostics.businessExpenseRowsLoaded} corporate expenses · {summary.diagnostics.mileageRowsLoaded} travel mileage logs.
            </p>
          </div>
        </div>
      </CollapsibleSection>

    </DashboardShell>
  );
}

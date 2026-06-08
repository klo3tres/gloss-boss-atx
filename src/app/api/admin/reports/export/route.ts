import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

function csv(rows: Record<string, unknown>[]) {
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}

export async function GET(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 });

  const url = new URL(request.url);
  const report = url.searchParams.get('report') ?? 'revenue';
  const from = url.searchParams.get('from') ?? new Date(Date.now() - 30 * 86400000).toISOString();
  const to = url.searchParams.get('to') ?? new Date().toISOString();
  const includeTest = url.searchParams.get('includeTest') === '1';

  let rows: Record<string, unknown>[] = [];
  if (report === 'expenses') {
    const expensesQ = admin.from('expenses').select('*').gte('occurred_at', from).lte('occurred_at', to).order('occurred_at', { ascending: false });
    const businessQ = admin.from('business_expenses').select('*').gte('incurred_at', from).lte('incurred_at', to).order('incurred_at', { ascending: false });
    const mileageQ = admin.from('job_mileage_logs').select('*').gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false });
    const [expensesRes, businessRes, mileageRes] = await Promise.all([
      includeTest ? expensesQ : expensesQ.eq('is_test', false).eq('exclude_from_reports', false),
      businessQ,
      mileageQ,
    ]);
    rows = [
      ...((expensesRes.data ?? []) as Record<string, unknown>[]).map((r) => ({ source: 'expenses', ...r })),
      ...((businessRes.data ?? []) as Record<string, unknown>[]).map((r) => ({ source: 'business_expenses', ...r })),
      ...((mileageRes.data ?? []) as Record<string, unknown>[]).map((r) => ({ source: 'job_mileage_logs', amount_cents: r.gas_cost_cents, ...r })),
    ];
  } else if (report === 'payments') {
    const q = admin.from('payments').select('*').gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false });
    const { data } = includeTest ? await q : await q.eq('is_test', false).eq('exclude_from_revenue', false);
    rows = (data ?? []) as Record<string, unknown>[];
  } else if (report === 'memberships') {
    const { data } = await admin.from('customer_memberships').select('*, membership_plans(name,tier), customers(full_name,email)').order('created_at', { ascending: false });
    rows = (data ?? []) as unknown as Record<string, unknown>[];
  } else {
    const q = admin.from('financial_ledger').select('*').gte('occurred_at', from).lte('occurred_at', to).order('occurred_at', { ascending: false });
    const { data } = includeTest ? await q : await q.eq('is_test', false).eq('exclude_from_reports', false);
    rows = (data ?? []) as Record<string, unknown>[];
  }

  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gloss-boss-${report}-report.csv"`,
    },
  });
}

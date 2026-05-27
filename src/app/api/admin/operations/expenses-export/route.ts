import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

function csvEscape(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

  const { data } = await admin.from('business_expenses').select('*').order('incurred_at', { ascending: false }).limit(5000);
  const rows = (data ?? []) as Record<string, unknown>[];
  const header = ['date', 'category', 'amount_usd', 'notes', 'receipt_url'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const cents = typeof r.amount_cents === 'number' ? r.amount_cents : 0;
    const date = String(r.incurred_at ?? r.incurred_on ?? r.created_at ?? '').slice(0, 10);
    lines.push(
      [
        csvEscape(date),
        csvEscape(String(r.category ?? '')),
        (cents / 100).toFixed(2),
        csvEscape(String(r.notes ?? r.note ?? '')),
        csvEscape(String(r.receipt_url ?? '')),
      ].join(','),
    );
  }
  const body = lines.join('\n');
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gloss-boss-expenses-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

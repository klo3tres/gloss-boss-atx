import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionWithProfile();
  const email = session.user?.email?.trim().toLowerCase() ?? '';
  const admin = tryCreateAdminSupabase();
  if (!session.user || !email) {
    return NextResponse.json({ signedIn: false, availableCents: 0, credits: [] });
  }
  if (!admin) {
    return NextResponse.json({ signedIn: true, availableCents: 0, credits: [], setupNeeded: true });
  }

  const { data: customer } = await admin
    .from('customers')
    .select('id, membership_discount_percent')
    .ilike('email', email)
    .maybeSingle();
  if (!customer?.id) {
    return NextResponse.json({ signedIn: true, availableCents: 0, credits: [] });
  }

  const memberPct = Math.max(0, Number((customer as { membership_discount_percent?: number }).membership_discount_percent ?? 0));

  const { data, error } = await admin
    .from('customer_credits')
    .select('id, remaining_cents, reason, expires_at, status')
    .eq('customer_id', customer.id)
    .in('status', ['active', 'partially_used'])
    .order('expires_at', { ascending: true, nullsFirst: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ signedIn: true, availableCents: 0, credits: [], setupNeeded: true });
  }

  const nowIso = new Date().toISOString();
  const credits = (data ?? [])
    .filter((row) => !row.expires_at || row.expires_at >= nowIso)
    .map((row) => ({
      id: String(row.id),
      remainingCents: Math.max(0, Number(row.remaining_cents ?? 0)),
      reason: String(row.reason ?? 'Store credit'),
      expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null,
    }))
    .filter((row) => row.remainingCents > 0);
  const availableCents = credits.reduce((sum, row) => sum + row.remainingCents, 0);
  return NextResponse.json({ signedIn: true, availableCents, credits, membershipDiscountPercent: memberPct });
}

import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { canAccessCustomerPortal } from '@/lib/auth/customer-portal';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadCustomerTimeline } from '@/lib/customer-timeline';

export async function GET() {
  const session = await getSessionWithProfile();
  const email = session.user?.email?.trim().toLowerCase();
  if (!email || !canAccessCustomerPortal(session.profile?.role)) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ events: [] });

  const { data: cust } = await admin.from('customers').select('id, email, phone, full_name').eq('email', email).maybeSingle();
  if (!cust?.id) return NextResponse.json({ events: [] });

  const bundle = await loadCustomerTimeline(admin, String(cust.id), {
    email: String(cust.email ?? email),
    phone: String(cust.phone ?? ''),
    full_name: String(cust.full_name ?? ''),
  });
  const events = bundle.events.slice(0, 40).map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.title,
    detail: e.detail ?? null,
    occurredAt: e.occurredAt,
    href: e.href ?? null,
  }));

  return NextResponse.json({ events });
}

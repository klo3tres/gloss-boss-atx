import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { canAccessCustomerPortal } from '@/lib/auth/customer-portal';
import { resolveAuthenticatedCustomer } from '@/lib/customer-account';
import { listCustomerMemberships } from '@/lib/customer-memberships';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionWithProfile();
  const email = session.user?.email?.trim().toLowerCase() ?? '';
  if (!session.user?.id || !email || !canAccessCustomerPortal(session.profile?.role)) {
    return NextResponse.json({ error: 'Sign in to view memberships.' }, { status: 401 });
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Memberships are temporarily unavailable.' }, { status: 503 });
  const customer = await resolveAuthenticatedCustomer(admin, {
    authUserId: session.user.id,
    email,
    fullName: session.profile?.full_name,
  });
  if (!customer?.id) return NextResponse.json({ error: 'Your customer profile could not be loaded.' }, { status: 409 });
  try {
    const memberships = await listCustomerMemberships(admin, customer.id);
    return NextResponse.json({ ok: true, memberships });
  } catch {
    return NextResponse.json({ error: 'Your memberships could not be loaded. Please try again.' }, { status: 500 });
  }
}

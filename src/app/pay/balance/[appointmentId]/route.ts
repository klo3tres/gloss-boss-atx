import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { logBalancePaymentLinkClick } from '@/lib/payment-link-tracking';
import { createCustomerFinalBalanceCheckoutSession } from '@/lib/stripe/checkout';
import { getAppOrigin } from '@/lib/env/app-origin';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params;
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const origin = getAppOrigin(request);
  const admin = tryCreateAdminSupabase();

  if (!admin || !appointmentId || !token) {
    return NextResponse.redirect(`${origin}/customer?payment=invalid`);
  }

  const { data: appt } = await admin
    .from('appointments')
    .select('access_token, final_payment_url, balance_due_cents')
    .eq('id', appointmentId)
    .maybeSingle();

  if (!appt || String(appt.access_token ?? '') !== token) {
    return NextResponse.redirect(`${origin}/customer?payment=invalid`);
  }

  const session = await getSessionWithProfile();
  await logBalancePaymentLinkClick(admin, appointmentId, {
    headers: request.headers,
    role: session.profile?.role,
    token,
  });
  if (session.user && isStaffRole(session.profile?.role)) {
    return NextResponse.redirect(`${origin}/admin/customer-preview/${encodeURIComponent(appointmentId)}?tab=diagnostics`);
  }
  let stripeUrl = typeof appt.final_payment_url === 'string' ? appt.final_payment_url : null;
  if (!stripeUrl) {
    const checkout = await createCustomerFinalBalanceCheckoutSession({ admin, appointmentId, origin });
    if (checkout.ok && 'url' in checkout && checkout.url) stripeUrl = checkout.url;
  }

  if (!stripeUrl) {
    return NextResponse.redirect(`${origin}/customer?payment=unavailable&appointment_id=${appointmentId}`);
  }

  return NextResponse.redirect(stripeUrl);
}

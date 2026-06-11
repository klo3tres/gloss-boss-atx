import { NextResponse } from 'next/server';
import { isAdminLevel } from '@/lib/auth/roles';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { getAppOrigin } from '@/lib/env/app-origin';
import { createCustomerFinalBalanceCheckoutSession } from '@/lib/stripe/checkout';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { tryCreateServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function isFieldRole(role: string | null): boolean {
  return role === 'technician' || role === 'admin' || role === 'super_admin';
}

export async function POST(request: Request) {
  try {
    const supabase = await tryCreateServerSupabase();
    const admin = tryCreateAdminSupabase();
    if (!supabase || !admin) return NextResponse.json({ error: 'Server not configured' }, { status: 503 });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    let role = parseAppRole(profile?.role);
    if (!profile?.role && (user.email ?? '').trim().toLowerCase() === OWNER_LOGIN_EMAIL) role = 'super_admin';
    if (!isFieldRole(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as { appointmentId?: string };
    const appointmentId = String(body.appointmentId ?? '').trim();
    if (!appointmentId) return NextResponse.json({ error: 'Missing appointmentId' }, { status: 400 });

    const { data: appt, error } = await admin
      .from('appointments')
      .select('id, assigned_technician_id, status')
      .eq('id', appointmentId)
      .maybeSingle();
    const assigned = appt && typeof appt.assigned_technician_id === 'string' ? appt.assigned_technician_id : null;
    if (error || !appt || (assigned !== user.id && !isAdminLevel(role))) {
      return NextResponse.json({ error: 'Invalid job for this technician' }, { status: 400 });
    }

    const checkout = await createCustomerFinalBalanceCheckoutSession({
      admin,
      appointmentId,
      origin: getAppOrigin(request),
      technicianId: user.id,
    });
    if (!checkout.ok) {
      const status = checkout.code === 'STRIPE_NOT_CONFIGURED' ? 503 : checkout.code === 'NO_BALANCE_DUE' ? 200 : 400;
      return NextResponse.json({ ok: false, error: checkout.error, code: checkout.code, balanceCents: checkout.balanceCents }, { status });
    }
    if ('skipPayment' in checkout && checkout.skipPayment) {
      return NextResponse.json({
        ok: true,
        skipPayment: true,
        code: checkout.code,
        message: checkout.message,
        appointmentId: checkout.appointmentId,
        accessToken: checkout.accessToken,
        balanceCents: checkout.balanceCents,
      });
    }
    if (!('url' in checkout)) {
      return NextResponse.json({ ok: false, error: 'Checkout did not return a card URL', code: 'CHECKOUT_NO_URL', balanceCents: checkout.balanceCents }, { status: 400 });
    }
    return NextResponse.json({ ok: true, url: checkout.url, balanceCents: checkout.balanceCents });
  } catch (e) {
    console.warn('[tech/final-balance-checkout]', e);
    return NextResponse.json({ error: 'Could not create payment link' }, { status: 500 });
  }
}

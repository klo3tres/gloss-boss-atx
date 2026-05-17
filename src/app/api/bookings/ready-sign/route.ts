import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSdk } from '@/lib/stripe/stripeService';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let appointmentId = searchParams.get('appointmentId') ?? searchParams.get('appointment_id') ?? '';
    const fallbackBookingId = searchParams.get('fallbackBookingId') ?? searchParams.get('fallback_booking_id') ?? '';
    const customerId = searchParams.get('customerId') ?? searchParams.get('customer_id') ?? '';
    const paymentId = searchParams.get('paymentId') ?? searchParams.get('payment_id') ?? '';
    const email = (searchParams.get('email') ?? '').trim().toLowerCase();
    const phone = (searchParams.get('phone') ?? '').replace(/\D/g, '');
    let token = searchParams.get('token') ?? '';
    let sessionId = searchParams.get('session_id') ?? searchParams.get('sessionId') ?? '';

    const admin = tryCreateAdminSupabase();
    if (!admin) {
      return NextResponse.json({ error: 'Database not configured', code: 'SUPABASE_NOT_READY' }, { status: 503 });
    }

    if (paymentId) {
      const { data: payment } = await admin
        .from('payments')
        .select('appointment_id, fallback_booking_id, stripe_checkout_session_id')
        .eq('id', paymentId)
        .maybeSingle();
      const p = (payment ?? {}) as Record<string, unknown>;
      appointmentId ||= String(p.appointment_id ?? '');
      sessionId ||= String(p.stripe_checkout_session_id ?? '');
    }

    if (sessionId && !appointmentId) {
      const { data: apptBySession } = await admin
        .from('appointments')
        .select('id, access_token')
        .or(`stripe_checkout_session_id.eq.${sessionId},final_payment_checkout_session_id.eq.${sessionId}`)
        .maybeSingle();
      appointmentId = String((apptBySession as Record<string, unknown> | null)?.id ?? '');
      token ||= String((apptBySession as Record<string, unknown> | null)?.access_token ?? '');
    }

    let apptQuery = admin
      .from('appointments')
      .select(
        'id, access_token, status, guest_name, guest_email, guest_phone, vehicle_description, booking_vehicles, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, scheduled_start, service_address, service_city, service_state, service_zip, service_address_notes, assigned_technician_id, customer_id, vehicle_id, stripe_checkout_session_id',
      );
    if (appointmentId) apptQuery = apptQuery.eq('id', appointmentId);
    else if (customerId) apptQuery = apptQuery.eq('customer_id', customerId).order('created_at', { ascending: false }).limit(1);
    else if (email) apptQuery = apptQuery.eq('guest_email', email).order('created_at', { ascending: false }).limit(1);
    else if (phone) apptQuery = apptQuery.eq('guest_phone', phone).order('created_at', { ascending: false }).limit(1);
    else if (fallbackBookingId) apptQuery = apptQuery.eq('fallback_booking_id', fallbackBookingId).order('created_at', { ascending: false }).limit(1);
    else return NextResponse.json({ error: 'Missing booking parameters' }, { status: 400 });

    const { data: appt, error } = await apptQuery.maybeSingle();
    appointmentId = String((appt as Record<string, unknown> | null)?.id ?? appointmentId);
    token ||= String((appt as Record<string, unknown> | null)?.access_token ?? '');
    sessionId ||= String((appt as Record<string, unknown> | null)?.stripe_checkout_session_id ?? '');

    if (error || !appt || (token && appt.access_token !== token)) {
      return NextResponse.json({ error: 'Invalid booking' }, { status: 403 });
    }

    if (sessionId) {
      const stripe = await getStripeSdk(admin);
      if (stripe) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
          return NextResponse.json({ error: 'Invalid payment session' }, { status: 400 });
        }
      }
    }

    const { data: template } = await admin
      .from('agreement_templates')
      .select('id, title, body, version')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: existingSign } = await admin.from('signed_agreements').select('id').eq('appointment_id', appointmentId).maybeSingle();

    return NextResponse.json({
      appointment: appt,
      appointmentId,
      accessToken: token,
      sessionId,
      template: template ?? null,
      useNativeAgreementFallback: !template,
      paymentVerified: true,
      alreadySigned: Boolean(existingSign),
    });
  } catch (e) {
    console.warn('[api/bookings/ready-sign]', e);
    return NextResponse.json({ error: 'Could not verify booking' }, { status: 500 });
  }
}

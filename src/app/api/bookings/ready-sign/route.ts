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

    const { data: apptData, error } = await apptQuery.maybeSingle();
    let appt = apptData as Record<string, unknown> | null;
    let resolvedFallbackId = fallbackBookingId;
    if ((!appt || error) && fallbackBookingId) {
      const { data: fallback } = await admin
        .from('booking_fallbacks')
        .select('id, status, guest_name, guest_email, guest_phone, vehicle_description, booking_vehicles, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, scheduled_start, service_address, service_city, service_state, service_zip, service_address_notes, assigned_technician_id, customer_id, payload, stripe_checkout_session_id')
        .eq('id', fallbackBookingId)
        .maybeSingle();
      const fb = (fallback ?? null) as Record<string, unknown> | null;
      if (fb) {
        resolvedFallbackId = String(fb.id ?? fallbackBookingId);
        appt = { ...fb, id: '', fallback_booking_id: resolvedFallbackId, access_token: token };
      }
    }
    appointmentId = String(appt?.id ?? appointmentId);
    token ||= String(appt?.access_token ?? '');
    sessionId ||= String(appt?.stripe_checkout_session_id ?? '');

    if (!appt || (appointmentId && token && appt.access_token !== token)) {
      return NextResponse.json({ error: 'Invalid booking' }, { status: 403 });
    }

    let paymentVerified = false;
    if (sessionId && !['awaiting_payment', 'pending', 'assigned', 'confirmed'].includes(String(appt.status))) {
      const stripe = await getStripeSdk(admin);
      if (stripe) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
          return NextResponse.json({ error: 'Invalid payment session' }, { status: 400 });
        }
        paymentVerified = true;
      }
    }
    if (['deposit_paid', 'paid', 'full_paid', 'test_comped', 'manual_comped'].includes(String(appt.status)) || ['deposit_paid', 'paid', 'full_paid', 'comped'].includes(String((appt as Record<string, unknown>).payment_status))) {
      paymentVerified = true;
    }

    const { data: template } = await admin
      .from('agreement_templates')
      .select('id, title, body, version')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let existingSign: Record<string, unknown> | null = null;
    if (appointmentId) {
      const { data } = await admin.from('signed_agreements').select('id').eq('appointment_id', appointmentId).maybeSingle();
      existingSign = (data ?? null) as Record<string, unknown> | null;
    } else if (resolvedFallbackId) {
      const { data } = await admin.from('signed_agreements').select('id').eq('fallback_booking_id', resolvedFallbackId).maybeSingle();
      existingSign = (data ?? null) as Record<string, unknown> | null;
    }

    return NextResponse.json({
      appointment: appt,
      appointmentId,
      fallbackBookingId: resolvedFallbackId,
      accessToken: token,
      sessionId,
      template: template ?? null,
      useNativeAgreementFallback: !template,
      paymentVerified,
      alreadySigned: Boolean(existingSign),
    });
  } catch (e) {
    console.warn('[api/bookings/ready-sign]', e);
    return NextResponse.json({ error: 'Could not verify booking' }, { status: 500 });
  }
}

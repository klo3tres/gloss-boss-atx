import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSdk } from '@/lib/stripe/stripeService';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const appointmentId = searchParams.get('appointmentId');
    const token = searchParams.get('token');
    const sessionId = searchParams.get('session_id');

    if (!appointmentId || !token || !sessionId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const admin = tryCreateAdminSupabase();
    if (!admin) {
      return NextResponse.json({ error: 'Database not configured', code: 'SUPABASE_NOT_READY' }, { status: 503 });
    }

    const stripe = await getStripeSdk(admin);
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured', code: 'STRIPE_NOT_CONFIGURED' }, { status: 503 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid' || session.metadata?.appointment_id !== appointmentId) {
      return NextResponse.json({ error: 'Invalid payment session' }, { status: 400 });
    }

    const { data: appt, error } = await admin
      .from('appointments')
      .select(
        'id, access_token, status, guest_name, guest_email, guest_phone, vehicle_description, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, scheduled_start, service_address, service_city, service_state, service_zip, service_address_notes, assigned_technician_id, customer_id, vehicle_id',
      )
      .eq('id', appointmentId)
      .maybeSingle();

    if (error || !appt || appt.access_token !== token) {
      return NextResponse.json({ error: 'Invalid booking' }, { status: 403 });
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

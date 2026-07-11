import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSdk } from '@/lib/stripe/stripeService';
import { resolveWorkOrder } from '@/lib/work-order-resolve';
import { getAgreementRequestByToken } from '@/lib/agreements/requests';
import { buildAgreementSnapshotForOrder } from '@/lib/agreements/snapshot';

const APPT_SELECT =
  'id, access_token, status, guest_name, guest_email, guest_phone, vehicle_description, booking_vehicles, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, scheduled_start, service_address, service_city, service_state, service_zip, service_address_notes, assigned_technician_id, customer_id, vehicle_id, stripe_checkout_session_id, payment_status';

const FB_SELECT =
  'id, status, guest_name, guest_email, guest_phone, vehicle_description, booking_vehicles, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, scheduled_start, service_address, service_city, service_state, service_zip, service_address_notes, assigned_technician_id, customer_id, payload, stripe_checkout_session_id, payment_status, access_token';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function apptFromFallback(fb: Record<string, unknown>, fallbackId: string): Record<string, unknown> {
  return { ...fb, id: '', fallback_booking_id: fallbackId, access_token: fb.access_token ?? '' };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let appointmentId = searchParams.get('appointmentId') ?? searchParams.get('appointment_id') ?? '';
    let fallbackBookingId = searchParams.get('fallbackBookingId') ?? searchParams.get('fallback_booking_id') ?? '';
    let workOrderId = searchParams.get('workOrderId') ?? searchParams.get('work_order_id') ?? '';
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

    let agreementTokenValidated = false;
    if (token) {
      const agreementRequest = await getAgreementRequestByToken(admin, token);
      if (agreementRequest) {
        if (new Date(agreementRequest.tokenExpiresAt).getTime() <= Date.now()) {
          return NextResponse.json({ error: 'This agreement link has expired. Please request a new one.' }, { status: 410 });
        }
        if (agreementRequest.status === 'voided') {
          return NextResponse.json({ error: 'This agreement request was voided. Please request a new one.' }, { status: 410 });
        }
        appointmentId = agreementRequest.appointmentId ?? appointmentId;
        workOrderId = agreementRequest.workOrderId ?? workOrderId;
        agreementTokenValidated = true;
      }
    }

    if (workOrderId && !appointmentId && !fallbackBookingId) {
      const resolved = await resolveWorkOrder(admin, workOrderId);
      if (resolved) {
        appointmentId = resolved.isFallback ? '' : resolved.canonicalId;
        fallbackBookingId = resolved.isFallback ? resolved.canonicalId : '';
      }
    }

    if (paymentId) {
      const { data: payment } = await admin
        .from('payments')
        .select('appointment_id, fallback_booking_id, stripe_checkout_session_id')
        .eq('id', paymentId)
        .maybeSingle();
      const p = (payment ?? {}) as Record<string, unknown>;
      appointmentId ||= str(p.appointment_id);
      fallbackBookingId ||= str(p.fallback_booking_id);
      sessionId ||= str(p.stripe_checkout_session_id);
    }

    if (sessionId && !appointmentId && !fallbackBookingId) {
      const { data: apptBySession } = await admin
        .from('appointments')
        .select('id, access_token')
        .or(`stripe_checkout_session_id.eq.${sessionId},final_payment_checkout_session_id.eq.${sessionId}`)
        .maybeSingle();
      appointmentId = str((apptBySession as Record<string, unknown> | null)?.id);
      token ||= str((apptBySession as Record<string, unknown> | null)?.access_token);
    }

    let appt: Record<string, unknown> | null = null;
    let resolvedFallbackId = fallbackBookingId;

    if (fallbackBookingId && !appointmentId) {
      const { data: fb } = await admin.from('booking_fallbacks').select(FB_SELECT).eq('id', fallbackBookingId).maybeSingle();
      if (fb) {
        resolvedFallbackId = str((fb as Record<string, unknown>).id) || fallbackBookingId;
        appt = apptFromFallback(fb as Record<string, unknown>, resolvedFallbackId);
      }
    } else if (appointmentId) {
      const { data } = await admin.from('appointments').select(APPT_SELECT).eq('id', appointmentId).maybeSingle();
      appt = (data as Record<string, unknown> | null) ?? null;
    } else if (customerId) {
      const { data } = await admin.from('appointments').select(APPT_SELECT).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      appt = (data as Record<string, unknown> | null) ?? null;
      if (!appt) {
        const { data: fb } = await admin.from('booking_fallbacks').select(FB_SELECT).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (fb) {
          resolvedFallbackId = str((fb as Record<string, unknown>).id);
          appt = apptFromFallback(fb as Record<string, unknown>, resolvedFallbackId);
        }
      }
    } else if (email) {
      const { data } = await admin.from('appointments').select(APPT_SELECT).eq('guest_email', email).order('created_at', { ascending: false }).limit(1).maybeSingle();
      appt = (data as Record<string, unknown> | null) ?? null;
      if (!appt) {
        const { data: fb } = await admin.from('booking_fallbacks').select(FB_SELECT).eq('guest_email', email).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (fb) {
          resolvedFallbackId = str((fb as Record<string, unknown>).id);
          appt = apptFromFallback(fb as Record<string, unknown>, resolvedFallbackId);
        }
      }
    } else if (phone) {
      const { data } = await admin.from('appointments').select(APPT_SELECT).eq('guest_phone', phone).order('created_at', { ascending: false }).limit(1).maybeSingle();
      appt = (data as Record<string, unknown> | null) ?? null;
      if (!appt) {
        const { data: fb } = await admin.from('booking_fallbacks').select(FB_SELECT).eq('guest_phone', phone).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (fb) {
          resolvedFallbackId = str((fb as Record<string, unknown>).id);
          appt = apptFromFallback(fb as Record<string, unknown>, resolvedFallbackId);
        }
      }
    } else {
      return NextResponse.json({ error: 'Missing booking parameters' }, { status: 400 });
    }

    if (!appt && fallbackBookingId) {
      const { data: fb } = await admin.from('booking_fallbacks').select(FB_SELECT).eq('id', fallbackBookingId).maybeSingle();
      if (fb) {
        resolvedFallbackId = str((fb as Record<string, unknown>).id) || fallbackBookingId;
        appt = apptFromFallback(fb as Record<string, unknown>, resolvedFallbackId);
      }
    }

    if (!appt) {
      return NextResponse.json({ error: 'Invalid booking' }, { status: 403 });
    }

    appointmentId = str(appt.id) || appointmentId;
    token ||= str(appt.access_token);
    sessionId ||= str(appt.stripe_checkout_session_id);
    const rowToken = str(appt.access_token);
    if (!agreementTokenValidated && token && rowToken && rowToken !== token) {
      return NextResponse.json({ error: 'Invalid booking' }, { status: 403 });
    }

    let paymentVerified = false;
    const status = str(appt.status).toLowerCase();
    const payStatus = str(appt.payment_status).toLowerCase();
    if (sessionId && !['awaiting_payment', 'pending', 'assigned', 'confirmed', 'in_progress', 'completed'].includes(status)) {
      const stripe = await getStripeSdk(admin);
      if (stripe) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
          return NextResponse.json({ error: 'Invalid payment session' }, { status: 400 });
        }
        paymentVerified = true;
      }
    }
    if (
      ['deposit_paid', 'paid', 'full_paid', 'test_comped', 'manual_comped', 'comped', 'in_progress', 'completed', 'confirmed', 'assigned'].includes(status) ||
      ['deposit_paid', 'paid', 'full_paid', 'comped'].includes(payStatus)
    ) {
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

    const agreementSnapshot = await buildAgreementSnapshotForOrder(admin, {
      appointmentId,
      workOrderId: workOrderId || appointmentId,
    });

    return NextResponse.json({
      appointment: appt,
      appointmentId,
      fallbackBookingId: resolvedFallbackId,
      accessToken: token,
      sessionId,
      template: template ?? null,
      agreementSnapshot,
      useNativeAgreementFallback: !template,
      paymentVerified,
      alreadySigned: Boolean(existingSign),
    });
  } catch (e) {
    console.warn('[api/bookings/ready-sign]', e);
    return NextResponse.json({ error: 'Could not verify booking' }, { status: 500 });
  }
}

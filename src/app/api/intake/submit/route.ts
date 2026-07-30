import { NextResponse } from 'next/server';

import { isSchemaDriftError } from '@/lib/booking-server-shared';

import { recordJobTimelineEvent } from '@/lib/job-timeline-server';

import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

import { getStripeSdk } from '@/lib/stripe/stripeService';
import { loadOrderSnapshot } from '@/lib/order-snapshot-engine';



export const runtime = 'nodejs';



async function verifyPaidSession(admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>, appointmentId: string, sessionId: string) {

  const stripe = await getStripeSdk(admin);

  if (!stripe) return false;

  try {

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return session.payment_status === 'paid' && session.metadata?.appointment_id === appointmentId;

  } catch {

    return false;

  }

}



export async function POST(req: Request) {

  try {

    const body = (await req.json()) as {

      appointmentId?: string;

      token?: string;

      sessionId?: string | null;

      formData?: Record<string, unknown>;

      signatureText?: string;

    };



    const appointmentId = String(body.appointmentId ?? '').trim();

    const token = String(body.token ?? '').trim();

    const sessionId = String(body.sessionId ?? '').trim();

    const formData = body.formData && typeof body.formData === 'object' ? body.formData : {};

    const signatureText = String(body.signatureText ?? '').trim();



    if (!appointmentId || !token) {

      return NextResponse.json({ ok: false, error: 'Missing parameters' }, { status: 400 });

    }

    if (!signatureText || signatureText.length < 3) {

      return NextResponse.json({ ok: false, error: 'Please type your full name to acknowledge the intake.' }, { status: 400 });

    }



    const admin = tryCreateAdminSupabase();

    if (!admin) {

      return NextResponse.json({ ok: false, error: 'Server unavailable' }, { status: 503 });

    }



    const { data: appt, error: apptErr } = await admin

      .from('appointments')

      .select('id, access_token, status, payment_choice, customer_id')

      .eq('id', appointmentId)

      .maybeSingle();



    if (apptErr || !appt || appt.access_token !== token) {

      return NextResponse.json({ ok: false, error: 'This secure booking link could not be verified.' }, { status: 403 });

    }



    const snapshot = await loadOrderSnapshot(admin, { appointmentId });
    let paymentOk = Boolean(
      snapshot &&
      (
        ['deposit_paid', 'paid', 'comped', 'no_payment_required'].includes(snapshot.paymentStatus) ||
        ['pay_later', 'pay_on_arrival'].includes(String(appt.payment_choice ?? '').toLowerCase())
      )
    );

    if (!paymentOk && sessionId) {

      paymentOk = await verifyPaidSession(admin, appointmentId, sessionId);

    }



    if (!paymentOk) {

      return NextResponse.json({ ok: false, error: 'Complete payment before intake' }, { status: 400 });

    }



    const row: Record<string, unknown> = {

      appointment_id: appointmentId,

      form_data: formData,

      signature_text: signatureText,

      created_at: new Date().toISOString(),

    };

    if (appt.customer_id) row.customer_id = appt.customer_id;



    const tryUpsert = async (r: Record<string, unknown>) =>

      admin.from('intake_submissions').upsert(r, { onConflict: 'appointment_id' });



    let ins = await tryUpsert(row);

    if (ins.error && isSchemaDriftError(ins.error.message)) {

      const lean = { appointment_id: appointmentId, form_data: formData, created_at: row.created_at };

      ins = await tryUpsert(lean);

    }

    if (ins.error && /signature_text|customer_id/i.test(ins.error.message)) {

      const noSig = { appointment_id: appointmentId, form_data: formData, created_at: row.created_at };

      ins = await tryUpsert(noSig);

    }



    if (ins.error) {

      console.warn('[intake] submit', ins.error.message);

      return NextResponse.json({ ok: false, error: 'Could not save intake. Please try again.' }, { status: 500 });

    }



    const location = typeof formData.parking_location === 'string' ? formData.parking_location.trim() : '';

    const vehicle = typeof formData.vehicle_year_make_model === 'string' ? formData.vehicle_year_make_model.trim() : '';

    const notesParts = [vehicle, location].filter(Boolean);



    let u = await admin

      .from('appointments')

      .update({

        intake_completed_at: new Date().toISOString(),

        ...(notesParts.length ? { notes: notesParts.join(' · ') } : {}),

        ...(vehicle ? { vehicle_description: vehicle } : {}),

        updated_at: new Date().toISOString(),

      })

      .eq('id', appointmentId);

    if (u.error && isSchemaDriftError(u.error.message)) {

      u = await admin

        .from('appointments')

        .update({ updated_at: new Date().toISOString() })

        .eq('id', appointmentId);

    }

    if (u.error) console.warn('[intake] appt update', u.error.message);



    await recordJobTimelineEvent(admin, {

      appointmentId,

      eventType: 'intake_submitted',

      meta: { has_signature: true },

    });



    return NextResponse.json({ ok: true });

  } catch (e) {

    console.warn('[intake] submit', e);

    return NextResponse.json({ ok: false, error: 'Submit failed' }, { status: 500 });

  }

}


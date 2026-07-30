import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSdk } from '@/lib/stripe/stripeService';
import { buildNativeAgreementSnapshot } from '@/lib/default-gloss-boss-agreement';
import { insertJobAgreementFlexible, insertSignedAgreementFlexible } from '@/lib/signed-agreement-insert';
import { getAgreementRequestByToken, markAgreementSigned } from '@/lib/agreements/requests';
import { buildAgreementSnapshotForOrder } from '@/lib/agreements/snapshot';
import { promoteFallbackToAppointment } from '@/lib/booking-diagnostics';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      appointmentId?: string;
      fallbackBookingId?: string;
      accessToken?: string;
      sessionId?: string;
      templateId?: string;
      signerLegalName?: string;
      signatureType?: 'typed' | 'drawn';
      signatureData?: string | null;
      agreementSnapshot?: string;
      acknowledged?: boolean;
      marketingMediaConsent?: boolean;
      smsConsent?: boolean;
    };

    const {
      appointmentId: submittedAppointmentId,
      fallbackBookingId,
      accessToken,
      sessionId,
      templateId,
      signerLegalName,
      signatureType,
      signatureData,
      agreementSnapshot,
      acknowledged,
      marketingMediaConsent,
      smsConsent,
    } = body;

    let appointmentId = submittedAppointmentId;

    const marketingOk = Boolean(marketingMediaConsent);
    const smsOk = Boolean(smsConsent);

    if (
      (!appointmentId && !fallbackBookingId) ||
      (!accessToken && !sessionId) ||
      !signerLegalName ||
      !signatureType ||
      !acknowledged
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const admin = tryCreateAdminSupabase();
    if (!admin) {
      return NextResponse.json({ error: 'Database not configured', code: 'SUPABASE_NOT_READY' }, { status: 503 });
    }

    let agreementTokenValidated = false;
    if (accessToken) {
      const agreementRequest = await getAgreementRequestByToken(admin, accessToken);
      if (agreementRequest) {
        if (new Date(agreementRequest.tokenExpiresAt).getTime() <= Date.now() || agreementRequest.status === 'voided') {
          return NextResponse.json({ error: 'This agreement link is no longer valid.' }, { status: 410 });
        }
        if (appointmentId && agreementRequest.appointmentId && agreementRequest.appointmentId !== appointmentId) {
          return NextResponse.json({ error: 'Agreement request does not match this work order.' }, { status: 403 });
        }
        appointmentId = agreementRequest.appointmentId ?? appointmentId;
        agreementTokenValidated = true;
      }
    }

    let paidSessionValidated = false;
    if (sessionId) {
      const stripe = await getStripeSdk(admin);
      if (!stripe) return NextResponse.json({ error: 'Payment verification unavailable' }, { status: 503 });
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
        return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
      }
      if (!session.metadata?.appointment_id || session.metadata.appointment_id !== appointmentId) {
        return NextResponse.json({ error: 'Session mismatch' }, { status: 403 });
      }
      paidSessionValidated = true;
    }

    let { data: appt, error: apptErr } = appointmentId
      ? await admin
          .from('appointments')
          .select(
            'id, access_token, status, guest_name, guest_email, guest_phone, vehicle_description, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, customer_id, assigned_technician_id',
          )
          .eq('id', appointmentId)
          .maybeSingle()
      : { data: null, error: null };
    let resolvedFallbackId = fallbackBookingId ?? '';
    if (!appt && fallbackBookingId) {
      const fb = await admin
        .from('booking_fallbacks')
        .select('id, status, guest_name, guest_email, guest_phone, vehicle_description, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, customer_id, assigned_technician_id, access_token')
        .eq('id', fallbackBookingId)
        .maybeSingle();
      appt = fb.data as typeof appt;
      apptErr = fb.error as typeof apptErr;
      resolvedFallbackId = fallbackBookingId;
    }

    if (apptErr || !appt) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    }
    const rowToken = appt.access_token ? String(appt.access_token) : '';
    if (
      !agreementTokenValidated &&
      !paidSessionValidated &&
      (!accessToken || !rowToken || rowToken !== accessToken)
    ) {
      return NextResponse.json({ error: 'This secure booking link could not be verified.' }, { status: 403 });
    }

    const signableStatuses = [
      'awaiting_payment',
      'pending',
      'deposit_paid',
      'confirmed',
      'assigned',
      'in_progress',
      'completed',
      'test_comped',
      'manual_comped',
      'paid',
      'full_paid',
      'comped',
    ];
    if (!signableStatuses.includes(String(appt.status))) {
      return NextResponse.json({ error: 'Deposit must be completed before signing' }, { status: 400 });
    }

    const { data: existing } = await admin
      .from('signed_agreements')
      .select('id')
      .eq(appointmentId ? 'appointment_id' : 'fallback_booking_id', appointmentId || resolvedFallbackId)
      .maybeSingle();

    if (existing) {
      let confirmationPending: string | null = null;
      if (appointmentId) {
        const { confirmAppointmentLifecycle } = await import('@/lib/appointment-lifecycle');
        const confirmation = await confirmAppointmentLifecycle(admin, {
          appointmentId,
          reason: 'Existing acknowledgement rechecked confirmation eligibility',
        });
        if (!confirmation.ok) confirmationPending = confirmation.error ?? 'Confirmation pending';
      }
      return NextResponse.json({
        ok: true,
        alreadySigned: true,
        appointmentId: appointmentId || null,
        fallbackBookingId: resolvedFallbackId || null,
        accessToken: accessToken || null,
        confirmationPending,
      });
    }

    let template = null as { id: string; version: number; body: string; title: string } | null;
    if (templateId) {
      const { data: t } = await admin
        .from('agreement_templates')
        .select('id, version, body, title')
        .eq('id', templateId)
        .maybeSingle();
      template = t;
    }
    if (!template) {
      const { data: t } = await admin
        .from('agreement_templates')
        .select('id, version, body, title')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      template = t;
    }

    const Ap = appt as Record<string, unknown>;
    let techName: string | null = null;
    const techId = typeof Ap.assigned_technician_id === 'string' ? Ap.assigned_technician_id : null;
    if (techId) {
      const { data: tp } = await admin.from('profiles').select('full_name').eq('id', techId).maybeSingle();
      if (tp && typeof (tp as { full_name?: string }).full_name === 'string') {
        techName = (tp as { full_name: string }).full_name.trim() || null;
      }
    }

    const totalCents = typeof Ap.base_price_cents === 'number' ? Ap.base_price_cents : 0;
    const depCents = typeof Ap.deposit_amount_cents === 'number' ? Ap.deposit_amount_cents : 0;
    const depositNote =
      depCents > 0
        ? `Deposit paid or due: $${(depCents / 100).toFixed(2)} per booking checkout.`
        : 'Deposit per shop policy at time of booking.';

    const vc = String(Ap.vehicle_class ?? 'sedan');
    const classLabel =
      vc === 'truck' ? 'Truck' : vc === 'suv' || vc === 'suv_truck' ? 'SUV' : 'Sedan';
    const serviceLabel = String(Ap.service_slug ?? 'service').replace(/-/g, ' ');

    const nativeSnap = buildNativeAgreementSnapshot({
      customerName: String(Ap.guest_name ?? signerLegalName).trim() || signerLegalName.trim(),
      customerEmail: typeof Ap.guest_email === 'string' ? Ap.guest_email : null,
      customerPhone: typeof Ap.guest_phone === 'string' ? Ap.guest_phone : null,
      vehicleDescription: String(Ap.vehicle_description ?? '').trim() || 'See booking.',
      serviceLabel,
      vehicleClassLabel: classLabel,
      totalDollars: (totalCents / 100).toFixed(2),
      depositNote,
      technicianName: techName,
    });

    const authoritativeSnapshot = appointmentId
      ? await buildAgreementSnapshotForOrder(admin, { appointmentId, workOrderId: appointmentId })
      : null;
    const snapshot =
      authoritativeSnapshot ??
      (typeof agreementSnapshot === 'string' && agreementSnapshot.trim().length > 2 ? agreementSnapshot : null) ??
      (template?.body?.trim() ? String(template.body) : null) ??
      nativeSnap;
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null;
    const ua = request.headers.get('user-agent') ?? null;

    const signPayload: Record<string, unknown> = {
      appointment_id: appointmentId || null,
      fallback_booking_id: resolvedFallbackId || null,
      template_id: template?.id ?? null,
      template_version: template?.version ?? 1,
      agreement_snapshot: snapshot,
      signer_legal_name: signerLegalName.trim(),
      signature_type: signatureType,
      signature_data: signatureData ?? null,
      ip_address: ip,
      user_agent: ua,
      customer_id: typeof Ap.customer_id === 'string' ? Ap.customer_id : null,
      vehicle_id: typeof Ap.vehicle_id === 'string' ? Ap.vehicle_id : null,
      technician_id: techId,
      marketing_media_consent: marketingOk,
      media_consent: marketingOk,
      operational_photo_consent: true,
      photo_consent: true,
      sms_consent: smsOk,
    };

    const signRes = await insertSignedAgreementFlexible(admin, signPayload);
    if (signRes.error) {
      console.error('[agreements/sign] signed_agreements', signRes.error.message);
      const { data: intakeRow } = await admin.from('intake_submissions').select('form_data').eq('appointment_id', appointmentId).maybeSingle();
      const prevForm = (intakeRow?.form_data as Record<string, unknown>) ?? {};
      const backupForm = {
        ...prevForm,
        deposit_legal_ack: {
          signer_legal_name: signerLegalName.trim(),
          signature_type: signatureType,
          signature_data: signatureData ?? null,
          agreement_snapshot: snapshot,
          stored_at: new Date().toISOString(),
        },
      };
      const intakeUpsert: Record<string, unknown> = {
        appointment_id: appointmentId,
        form_data: backupForm,
      };
      if (typeof Ap.customer_id === 'string' && Ap.customer_id) intakeUpsert.customer_id = Ap.customer_id;
      let iu = await admin.from('intake_submissions').upsert(intakeUpsert, { onConflict: 'appointment_id' });
      if (iu.error && /agreement_snapshot|column|schema cache/i.test(iu.error.message)) {
        iu = await admin.from('intake_submissions').upsert({ ...intakeUpsert, agreement_snapshot: snapshot }, { onConflict: 'appointment_id' });
      }
      if (iu.error) {
        return NextResponse.json({ error: 'Could not save agreement' }, { status: 500 });
      }
    }

    const ja = await insertJobAgreementFlexible(admin, {
      appointment_id: appointmentId || null,
      fallback_booking_id: resolvedFallbackId || null,
      signer_legal_name: signerLegalName.trim(),
      agreement_snapshot: snapshot,
      signature_type: signatureType,
      signature_data: signatureData ?? null,
      template_id: template?.id ?? null,
      template_version: template?.version ?? 1,
      signed_at: new Date().toISOString(),
    });
    if (ja.error && !/duplicate|unique|already exists/i.test(ja.error.message)) {
      console.warn('[agreements/sign] job_agreements', ja.error.message);
    }

    let promotedAppointment: { id: string; access_token: string } | null = null;
    let appointmentConfirmed = false;
    let confirmationDelivery: Record<string, unknown> | null = null;
    if (appointmentId) {
      const { confirmAppointmentLifecycle } = await import('@/lib/appointment-lifecycle');
      const confirmation = await confirmAppointmentLifecycle(admin, {
        appointmentId,
        reason: 'Customer acknowledgement completed',
      });
      if (!confirmation.ok && !confirmation.code) {
        return NextResponse.json(
          { error: `Acknowledgement saved, but confirmation failed: ${confirmation.error}` },
          { status: 500 },
        );
      }
      appointmentConfirmed = confirmation.ok;
      if (appointmentConfirmed) {
        const { sendBookingConfirmation } = await import('@/lib/booking-confirmation-send');
        const delivery = await sendBookingConfirmation(admin, {
          appointmentId,
          channel: 'both',
          skipOwnerNotify: true,
        });
        confirmationDelivery = {
          ok: delivery.ok,
          emailStatus: delivery.email?.status ?? 'not_sent',
          smsStatus: delivery.sms?.status ?? 'not_sent',
          error: delivery.error ?? delivery.email?.error ?? delivery.sms?.error ?? null,
        };
      }

      let signedAgreementId: string | null = null;
      try {
        const { data: signedRow } = await admin
          .from('signed_agreements')
          .select('id')
          .eq('appointment_id', appointmentId)
          .order('signed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        signedAgreementId = signedRow?.id ? String(signedRow.id) : null;
      } catch {
        /* optional lookup */
      }

      await markAgreementSigned(admin, {
        appointmentId,
        signedAgreementId,
        signerName: signerLegalName.trim(),
        marketingMediaConsent: marketingOk,
        smsConsent: smsOk,
        mode: 'signed',
      });
    } else if (resolvedFallbackId) {
      promotedAppointment = accessToken
        ? await promoteFallbackToAppointment(admin, resolvedFallbackId, accessToken)
        : null;
      if (promotedAppointment?.id) {
        await Promise.all([
          admin
            .from('signed_agreements')
            .update({ appointment_id: promotedAppointment.id })
            .eq('fallback_booking_id', resolvedFallbackId),
          admin
            .from('job_agreements')
            .update({ appointment_id: promotedAppointment.id })
            .eq('fallback_booking_id', resolvedFallbackId),
        ]);
      }
      if (promotedAppointment?.id) {
        const { confirmAppointmentLifecycle } = await import('@/lib/appointment-lifecycle');
        const confirmation = await confirmAppointmentLifecycle(admin, {
          appointmentId: promotedAppointment.id,
          reason: 'Promoted fallback acknowledgement completed',
        });
        appointmentConfirmed = confirmation.ok;
        if (appointmentConfirmed) {
          const { sendBookingConfirmation } = await import('@/lib/booking-confirmation-send');
          const delivery = await sendBookingConfirmation(admin, {
            appointmentId: promotedAppointment.id,
            channel: 'both',
            skipOwnerNotify: true,
          });
          confirmationDelivery = {
            ok: delivery.ok,
            emailStatus: delivery.email?.status ?? 'not_sent',
            smsStatus: delivery.sms?.status ?? 'not_sent',
            error: delivery.error ?? delivery.email?.error ?? delivery.sms?.error ?? null,
          };
        }
      }
    }

    return NextResponse.json({
      ok: true,
      marketingMediaConsent: marketingOk,
      smsConsent: smsOk,
      appointmentId: appointmentId || promotedAppointment?.id || null,
      accessToken: promotedAppointment?.access_token || accessToken || null,
      fallbackBookingId: resolvedFallbackId || null,
      appointmentConfirmed,
      confirmationDelivery,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Sign failed' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSdk } from '@/lib/stripe/stripeService';
import { buildNativeAgreementSnapshot } from '@/lib/default-gloss-boss-agreement';
import { insertJobAgreementFlexible, insertSignedAgreementFlexible } from '@/lib/signed-agreement-insert';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      appointmentId?: string;
      accessToken?: string;
      sessionId?: string;
      templateId?: string;
      signerLegalName?: string;
      signatureType?: 'typed' | 'drawn';
      signatureData?: string | null;
      agreementSnapshot?: string;
      acknowledged?: boolean;
    };

    const {
      appointmentId,
      accessToken,
      sessionId,
      templateId,
      signerLegalName,
      signatureType,
      signatureData,
      agreementSnapshot,
      acknowledged,
    } = body;

    if (!appointmentId || !accessToken || !sessionId || !signerLegalName || !signatureType || !acknowledged) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
    }
    if (session.metadata?.appointment_id !== appointmentId) {
      return NextResponse.json({ error: 'Session mismatch' }, { status: 400 });
    }

    const { data: appt, error: apptErr } = await admin
      .from('appointments')
      .select(
        'id, access_token, status, guest_name, guest_email, guest_phone, vehicle_description, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, customer_id, vehicle_id, assigned_technician_id',
      )
      .eq('id', appointmentId)
      .maybeSingle();

    if (apptErr || !appt || appt.access_token !== accessToken) {
      return NextResponse.json({ error: 'Invalid booking' }, { status: 403 });
    }

    if (appt.status !== 'deposit_paid') {
      return NextResponse.json({ error: 'Deposit must be completed before signing' }, { status: 400 });
    }

    const { data: existing } = await admin
      .from('signed_agreements')
      .select('id')
      .eq('appointment_id', appointmentId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Agreement already signed' }, { status: 400 });
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
    const classLabel = vc === 'suv_truck' ? 'SUV / Truck' : 'Sedan';
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

    const snapshot =
      (typeof agreementSnapshot === 'string' && agreementSnapshot.trim().length > 2
        ? agreementSnapshot
        : null) ??
      (template?.body?.trim() ? String(template.body) : null) ??
      nativeSnap;
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null;
    const ua = request.headers.get('user-agent') ?? null;

    const signPayload: Record<string, unknown> = {
      appointment_id: appointmentId,
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
      appointment_id: appointmentId,
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

    await admin
      .from('appointments')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', appointmentId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Sign failed' }, { status: 500 });
  }
}

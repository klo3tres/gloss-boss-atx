import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSdk } from '@/lib/stripe/stripeService';

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
      .select('id, access_token, status')
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

    if (!template) {
      return NextResponse.json({ error: 'No agreement template configured' }, { status: 500 });
    }

    const snapshot = agreementSnapshot ?? template.body;
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null;
    const ua = request.headers.get('user-agent') ?? null;

    const { error: signErr } = await admin.from('signed_agreements').insert({
      appointment_id: appointmentId,
      template_id: template.id,
      template_version: template.version,
      agreement_snapshot: snapshot,
      signer_legal_name: signerLegalName.trim(),
      signature_type: signatureType,
      signature_data: signatureData ?? null,
      ip_address: ip,
      user_agent: ua,
    });

    if (signErr) {
      console.error(signErr);
      return NextResponse.json({ error: 'Could not save agreement' }, { status: 500 });
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

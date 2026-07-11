import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { markAgreementSigned, ensureAgreementRequest, logAgreementEvent } from '@/lib/agreements/requests';
import { buildNativeAgreementSnapshot, DEFAULT_AGREEMENT_TITLE } from '@/lib/default-gloss-boss-agreement';
import { cancelAgreementRemindersForAppointment } from '@/lib/agreements/reminders';

export const runtime = 'nodejs';

type Body = {
  appointmentId: string;
  recordedByUserId: string;
  customerName: string;
  marketingMediaConsent: boolean;
  smsConsent: boolean;
  note?: string;
  witnessName?: string;
  reason?: string;
  serviceAuthorized?: boolean;
};

export async function POST(request: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const appointmentId = String(body.appointmentId ?? '').trim();
  const customerName = String(body.customerName ?? '').trim();
  const recordedBy = String(body.recordedByUserId ?? '').trim();
  if (!appointmentId || !customerName || !recordedBy) {
    return NextResponse.json({ ok: false, error: 'appointmentId, customerName, and recordedByUserId are required.' }, { status: 400 });
  }
  if (body.serviceAuthorized === false) {
    return NextResponse.json({ ok: false, error: 'Service authorization is required for verbal acknowledgment.' }, { status: 400 });
  }

  const { data: appt } = await admin
    .from('appointments')
    .select('id, access_token, guest_name, guest_email, guest_phone, vehicle_description, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, customer_id, service_address')
    .eq('id', appointmentId)
    .maybeSingle();
  if (!appt) return NextResponse.json({ ok: false, error: 'Appointment not found.' }, { status: 404 });

  const row = appt as Record<string, unknown>;
  const accessToken = String(row.access_token ?? '');
  await ensureAgreementRequest(admin, {
    appointmentId,
    customerId: String(row.customer_id ?? '') || null,
    accessToken: accessToken || 'verbal',
    createdBy: recordedBy,
  });

  const totalCents = Number(row.base_price_cents ?? 0) || 0;
  const depCents = Number(row.deposit_amount_cents ?? 0) || 0;
  const snapshot = [
    buildNativeAgreementSnapshot({
      customerName,
      customerEmail: String(row.guest_email ?? ''),
      customerPhone: String(row.guest_phone ?? ''),
      vehicleDescription: String(row.vehicle_description ?? 'Vehicle on file'),
      serviceLabel: String(row.service_slug ?? 'service').replace(/-/g, ' '),
      vehicleClassLabel: String(row.vehicle_class ?? 'sedan'),
      totalDollars: (totalCents / 100).toFixed(2),
      depositNote: depCents > 0 ? `Deposit on file: $${(depCents / 100).toFixed(2)}` : 'Deposit status on file.',
      technicianName: null,
    }),
    '',
    '--- VERBAL ACKNOWLEDGMENT ---',
    `Recorded by staff user: ${recordedBy}`,
    `Customer name stated: ${customerName}`,
    `Reason electronic signature not completed: ${String(body.reason ?? 'Not provided').trim() || 'Not provided'}`,
    `Witness: ${String(body.witnessName ?? '').trim() || '—'}`,
    `Note: ${String(body.note ?? '').trim() || '—'}`,
    `Marketing media consent: ${body.marketingMediaConsent ? 'YES' : 'NO'}`,
    `SMS consent selection: ${body.smsConsent ? 'YES' : 'NO'}`,
    `Recorded at: ${new Date().toISOString()}`,
  ].join('\n');

  const insertPayload: Record<string, unknown> = {
    appointment_id: appointmentId,
    customer_id: String(row.customer_id ?? '') || null,
    signer_legal_name: customerName,
    signature_type: 'typed',
    signature_data: `VERBAL:${customerName}`,
    agreement_snapshot: snapshot,
    acknowledgment_mode: 'verbal',
    verbal_recorded_by: recordedBy,
    verbal_customer_name: customerName,
    verbal_reason: String(body.reason ?? '') || null,
    verbal_witness_name: String(body.witnessName ?? '') || null,
    marketing_media_consent: Boolean(body.marketingMediaConsent),
    operational_photo_consent: true,
    sms_consent: Boolean(body.smsConsent),
    title: DEFAULT_AGREEMENT_TITLE,
  };

  const { data: inserted, error } = await admin.from('signed_agreements').insert(insertPayload).select('id').maybeSingle();
  if (error || !inserted?.id) {
    // lean fallback without new columns if migration lag
    const lean = {
      appointment_id: appointmentId,
      signer_legal_name: customerName,
      signature_type: 'typed',
      signature_data: `VERBAL:${customerName}`,
      agreement_snapshot: snapshot,
      sms_consent: Boolean(body.smsConsent),
    };
    const fallback = await admin.from('signed_agreements').insert(lean).select('id').maybeSingle();
    if (fallback.error || !fallback.data?.id) {
      return NextResponse.json({ ok: false, error: error?.message ?? fallback.error?.message ?? 'Could not save verbal acknowledgment.' }, { status: 400 });
    }
    await markAgreementSigned(admin, {
      appointmentId,
      signedAgreementId: String(fallback.data.id),
      signerName: customerName,
      marketingMediaConsent: Boolean(body.marketingMediaConsent),
      smsConsent: Boolean(body.smsConsent),
      mode: 'verbal',
    });
    await cancelAgreementRemindersForAppointment(admin, appointmentId);
    return NextResponse.json({ ok: true, signedAgreementId: fallback.data.id, status: 'verbal', marketingMediaConsent: Boolean(body.marketingMediaConsent) });
  }

  await markAgreementSigned(admin, {
    appointmentId,
    signedAgreementId: String(inserted.id),
    signerName: customerName,
    marketingMediaConsent: Boolean(body.marketingMediaConsent),
    smsConsent: Boolean(body.smsConsent),
    mode: 'verbal',
  });
  await cancelAgreementRemindersForAppointment(admin, appointmentId);
  await logAgreementEvent(admin, {
    appointmentId,
    customerId: String(row.customer_id ?? '') || null,
    eventType: 'verbal_acknowledgment_recorded',
    actorUserId: recordedBy,
    detail: customerName,
    meta: {
      marketingMediaConsent: body.marketingMediaConsent,
      smsConsent: body.smsConsent,
      reason: body.reason ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    signedAgreementId: inserted.id,
    status: 'verbal',
    marketingMediaConsent: Boolean(body.marketingMediaConsent),
  });
}

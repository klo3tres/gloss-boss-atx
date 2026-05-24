'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { computeQuoteFromInputs, insertAppointmentResilient, type VehicleLineInput } from '@/lib/booking-server-shared';
import { fetchAppointmentForTechSign } from '@/lib/appointments-fetch-resilient';
import { normalizeUsPhone10Digits } from '@/lib/us-phone';
import { buildNativeAgreementSnapshot } from '@/lib/default-gloss-boss-agreement';
import { insertJobAgreementFlexible, insertSignedAgreementFlexible } from '@/lib/signed-agreement-insert';

export type WalkInVehicleInput = {
  serviceSlug: string;
  vehicleClass: string;
  vehicleDescription: string;
};

async function saveTechWorkflowSession(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<string | null> {
  const nowIso = new Date().toISOString();
  const payload = {
    ...row,
    status: row.status ?? 'active',
    updated_at: nowIso,
  };
  const { data, error } = await admin.from('tech_workflow_sessions').insert(payload).select('id').maybeSingle();
  if (error) {
    console.warn('[tech-workflow] session save failed', error.message);
    return null;
  }
  return typeof data?.id === 'string' ? data.id : null;
}

function formatUsPhoneDisplay(input: unknown): string {
  const d = String(input ?? '').replace(/\D/g, '').slice(0, 10);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(input ?? '').trim();
}

export async function techCreateWalkInJobAction(input: {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  vehicles: WalkInVehicleInput[];
  addOns: string[];
  customerId?: string | null;
  notes?: string;
}): Promise<
  | { ok: true; appointmentId: string; accessToken: string; totalCents: number; fallbackBookingId?: null; workflowSessionId?: string | null }
  | { ok: true; appointmentId: null; accessToken: string; totalCents: number; fallbackBookingId: string; workflowSessionId?: string | null }
  | { ok: false; error: string }
> {
  const session = await getSessionWithProfile();
  if (!session.user?.id) return { ok: false, error: 'Not signed in' };

  let role = parseAppRole(session.profile?.role ?? null);
  if (!session.profile?.role) {
    const em = (session.user.email ?? '').trim().toLowerCase();
    if (em === OWNER_LOGIN_EMAIL) role = 'super_admin';
  }
  if (role !== 'technician') return { ok: false, error: 'Walk-in workflow is for technicians.' };

  const vehicles = (input.vehicles ?? []).slice(0, 3).map(
    (v) =>
      ({
        serviceSlug: String(v.serviceSlug ?? '').trim(),
        vehicleClass: String(v.vehicleClass ?? '').trim(),
        vehicleDescription: String(v.vehicleDescription ?? '').trim(),
      }) satisfies VehicleLineInput,
  );
  if (vehicles.length === 0 || vehicles.some((v) => !v.serviceSlug || !v.vehicleDescription)) {
    return { ok: false, error: 'Add at least one vehicle with package and description.' };
  }

  const guestName = String(input.guestName ?? '').trim();
  const guestEmail = String(input.guestEmail ?? '').trim().toLowerCase();
  const phoneNorm = normalizeUsPhone10Digits(String(input.guestPhone ?? ''));
  if (!guestName || !guestEmail || !phoneNorm.ok) {
    return { ok: false, error: phoneNorm.ok ? 'Name and email are required.' : phoneNorm.error };
  }

  const addOns = Array.isArray(input.addOns)
    ? input.addOns
        .map((a) => String(a ?? '').trim())
        .filter(Boolean)
        .slice(0, 12)
        .map((s) => s.slice(0, 120))
    : [];

  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, error: 'Database not configured' };

  const quote = await computeQuoteFromInputs(admin, { lines: vehicles, addOns });
  if (!quote.ok) return { ok: false, error: quote.error };

  const totalBaseCents = quote.breakdown.finalTotalCents;
  const primary = quote.resolved[0]!;
  const vehicleDescriptionJoined = quote.resolved.map((r) => r.vehicleDescription).join(' · ');
  const bookingVehicles = quote.resolved.map((r) => ({
    service_slug: r.serviceSlug,
    vehicle_class: r.vehicleClass,
    vehicle_description: r.vehicleDescription,
    price_cents: r.priceCents,
  }));

  let customerId: string | null = input.customerId ?? null;
  if (customerId) {
    await admin
      .from('customers')
      .update({ phone: phoneNorm.digits10, full_name: guestName })
      .eq('id', customerId);
  } else {
    const { data: existingCustomer } = await admin.from('customers').select('id').eq('email', guestEmail).maybeSingle();
    if (existingCustomer?.id) {
      customerId = existingCustomer.id;
      await admin.from('customers').update({ phone: phoneNorm.digits10, full_name: guestName }).eq('id', customerId);
    } else {
      const { data: newCustomer, error: custErr } = await admin
        .from('customers')
        .insert({ email: guestEmail, phone: phoneNorm.digits10, full_name: guestName })
        .select('id')
        .single();
      if (custErr || !newCustomer) return { ok: false, error: 'Could not create customer' };
      customerId = newCustomer.id as string;
    }
  }

  const scheduled = new Date();
  scheduled.setMinutes(scheduled.getMinutes() + 30);
  const nowIso = new Date().toISOString();
  const notesRaw = String(input.notes ?? '').trim().slice(0, 2000);
  const notes = [notesRaw || null, 'Walk-in tech workflow'].filter(Boolean).join(' — ');

  const insertPayload: Record<string, unknown> = {
    guest_email: guestEmail,
    guest_phone: phoneNorm.digits10,
    guest_name: guestName,
    customer_id: customerId,
    vehicle_description: vehicleDescriptionJoined,
    service_slug: primary.serviceSlug,
    vehicle_class: primary.vehicleClass,
    base_price_cents: totalBaseCents,
    deposit_percent: 0,
    deposit_amount_cents: 0,
    scheduled_start: scheduled.toISOString(),
    notes: notes || null,
    status: 'assigned',
    booking_vehicles: bookingVehicles,
    booking_add_ons: addOns,
    assigned_technician_id: session.user.id,
    assigned_by: session.user.id,
    assigned_at: nowIso,
    intake_completed_at: nowIso,
    booking_source: 'tech_workflow',
  };

  const { data: appointment, error: apptErr } = await insertAppointmentResilient(admin, insertPayload);
  if (apptErr || !appointment) {
    const fallbackPayload = {
      ...insertPayload,
      tech_workflow: true,
      quote,
    };
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const fbRow: Record<string, unknown> = {
      payload: fallbackPayload,
      guest_email: guestEmail,
      guest_phone: phoneNorm.digits10,
      guest_name: guestName,
      deposit_amount_cents: 0,
      base_price_cents: totalBaseCents,
      scheduled_start: scheduled.toISOString(),
      status: 'needs_review',
      booking_source: 'tech_workflow',
      promotion_error: apptErr || 'appointment insert failed',
      expires_at: expiresAt,
      assigned_technician_id: session.user.id,
      assigned_by: session.user.id,
      assigned_at: nowIso,
      notes: notes || null,
    };
    let fb = await admin.from('booking_fallbacks').insert(fbRow).select('id, access_token').single();
    if (fb.error && /assigned_|expires_at|notes|booking_source|column|schema cache|Could not find/i.test(fb.error.message)) {
      fb = await admin
        .from('booking_fallbacks')
        .insert({
          payload: fallbackPayload,
          guest_email: guestEmail,
          guest_phone: phoneNorm.digits10,
          guest_name: guestName,
          deposit_amount_cents: 0,
          base_price_cents: totalBaseCents,
          scheduled_start: scheduled.toISOString(),
          status: 'needs_review',
          promotion_error: apptErr || 'appointment insert failed',
        })
        .select('id, access_token')
        .single();
    }
    if (fb.error || !fb.data?.id) {
      return { ok: false, error: apptErr || fb.error?.message || 'Could not create walk-in fallback' };
    }
    const fallbackId = String(fb.data.id);
    const fbAccessToken = String((fb.data as { access_token?: string | null }).access_token ?? '');
    const workflowSessionId = await saveTechWorkflowSession(admin, {
      technician_id: session.user.id,
      appointment_id: null,
      fallback_booking_id: fallbackId,
      access_token: fbAccessToken || null,
      customer_name: guestName,
      vehicle_summary: vehicleDescriptionJoined,
      service_slug: primary.serviceSlug,
      total_cents: totalBaseCents,
    });
    revalidatePath('/tech');
    revalidatePath('/tech/workflow');
    return {
      ok: true,
      appointmentId: null,
      accessToken: fbAccessToken,
      totalCents: totalBaseCents,
      fallbackBookingId: fallbackId,
      workflowSessionId,
    };
  }

  const verify = await admin.from('appointments').select('id').eq('id', appointment.id).maybeSingle();
  if (!verify.data?.id) {
    return { ok: false, error: 'Job was not persisted — check Supabase appointments table and try again.' };
  }

  revalidatePath('/tech');
  revalidatePath('/tech/workflow');
  const workflowSessionId = await saveTechWorkflowSession(admin, {
    technician_id: session.user.id,
    appointment_id: appointment.id,
    fallback_booking_id: null,
    access_token: appointment.access_token ?? null,
    customer_name: guestName,
    vehicle_summary: vehicleDescriptionJoined,
    service_slug: primary.serviceSlug,
    total_cents: totalBaseCents,
  });
  return {
    ok: true,
    appointmentId: appointment.id,
    accessToken: appointment.access_token,
    totalCents: totalBaseCents,
    fallbackBookingId: null,
    workflowSessionId,
  };
}

export async function techSignWalkInAgreementAction(input: {
  appointmentId?: string | null;
  fallbackBookingId?: string | null;
  signerLegalName: string;
  signatureType: 'typed' | 'drawn';
  signatureData: string | null;
  smsConsent?: boolean;
  technicianWitnessName?: string | null;
  technicianWitnessRole?: string | null;
  /** When set (e.g. work order recapture), stored as immutable agreement_snapshot text. */
  agreementSnapshotOverride?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const appointmentId = String(input.appointmentId ?? '').trim();
  const fallbackBookingId = String(input.fallbackBookingId ?? '').trim();
  const signerLegalName = String(input.signerLegalName ?? '').trim();
  const smsConsent = Boolean(input.smsConsent);
  const smsConsentAt = smsConsent ? new Date().toISOString() : null;
  if ((!appointmentId && !fallbackBookingId) || !signerLegalName) return { ok: false, error: 'Missing fields' };

  const session = await getSessionWithProfile();
  if (!session.user?.id) return { ok: false, error: 'Not signed in' };

  let role = parseAppRole(session.profile?.role ?? null);
  if (!session.profile?.role) {
    const em = (session.user.email ?? '').trim().toLowerCase();
    if (em === OWNER_LOGIN_EMAIL) role = 'super_admin';
  }
  if (role !== 'technician' && role !== 'admin' && role !== 'super_admin') return { ok: false, error: 'Technicians only' };

  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, error: 'Database not configured' };
  const { data: profileRow } = await admin.from('profiles').select('full_name, role').eq('id', session.user.id).maybeSingle();
  const witnessName =
    String(input.technicianWitnessName ?? '').trim() ||
    String((profileRow as { full_name?: string | null } | null)?.full_name ?? '').trim() ||
    session.user.email?.split('@')[0] ||
    'Gloss Boss technician';
  const witnessRole = String(input.technicianWitnessRole ?? '').trim() || role || String((profileRow as { role?: string | null } | null)?.role ?? 'technician');
  const witnessAt = new Date().toISOString();
  const smsConsentText =
    'I agree to receive SMS service updates from Gloss Boss ATX about this appointment. Message/data rates may apply. Reply STOP to opt out.';

  if (!appointmentId && fallbackBookingId) {
    const { data: fb, error: fbErr } = await admin
      .from('booking_fallbacks')
      .select('id, assigned_technician_id, payload')
      .eq('id', fallbackBookingId)
      .maybeSingle();
    if (fbErr || !fb?.id) return { ok: false, error: 'Fallback job not found' };
    const assigned = typeof fb.assigned_technician_id === 'string' ? fb.assigned_technician_id : null;
    if (assigned && assigned !== session.user.id && !isAdminLevel(role)) return { ok: false, error: 'This fallback job is not assigned to you' };
    const prevPayload = ((fb as { payload?: unknown }).payload && typeof (fb as { payload?: unknown }).payload === 'object'
      ? ((fb as { payload?: Record<string, unknown> }).payload ?? {})
      : {}) as Record<string, unknown>;
    const nextPayload = {
      ...prevPayload,
      walk_in_legal_ack: {
        signer_legal_name: signerLegalName,
        signature_type: input.signatureType,
        signature_data: input.signatureData ?? null,
        sms_consent: smsConsent,
        sms_consent_at: smsConsentAt,
        sms_consent_text: smsConsentText,
        technician_witness_id: session.user.id,
        technician_witness_name: witnessName,
        technician_witness_role: witnessRole,
        technician_witnessed_at: witnessAt,
        stored_at: new Date().toISOString(),
      },
    };
    const up = await admin.from('booking_fallbacks').update({ payload: nextPayload }).eq('id', fallbackBookingId);
    if (up.error) return { ok: false, error: up.error.message };
    revalidatePath('/tech');
    revalidatePath('/tech/workflow');
    return { ok: true };
  }

  const { data: appt, error: fetchErr } = await fetchAppointmentForTechSign(admin, appointmentId);
  if (fetchErr) {
    return { ok: false, error: `Could not load job: ${fetchErr}` };
  }
  if (!appt) {
    return { ok: false, error: 'Job not found — go back to the quote step and tap “Create job & continue” again.' };
  }
  const A = appt;

  if (A.assigned_technician_id !== session.user.id && !isAdminLevel(role)) {
    const srcRow = await admin.from('appointments').select('booking_source').eq('id', appointmentId).maybeSingle();
    const bookingSource = String((srcRow.data as { booking_source?: string } | null)?.booking_source ?? '');
    const isWalkIn = bookingSource === 'tech_workflow';
    if (isWalkIn && !A.assigned_technician_id) {
      const nowIso = new Date().toISOString();
      await admin
        .from('appointments')
        .update({
          assigned_technician_id: session.user.id,
          assigned_by: session.user.id,
          assigned_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', appointmentId);
      A.assigned_technician_id = session.user.id;
    } else {
      return { ok: false, error: 'This job is not assigned to you' };
    }
  }

  const { data: existing } = await admin.from('signed_agreements').select('id').eq('appointment_id', appointmentId).maybeSingle();
  if (existing) {
    const { data: existingIntake } = await admin.from('intake_submissions').select('form_data').eq('appointment_id', appointmentId).maybeSingle();
    const existingForm = (existingIntake?.form_data as Record<string, unknown>) ?? {};
    await admin
      .from('intake_submissions')
      .upsert(
        {
          appointment_id: appointmentId,
          form_data: {
            ...existingForm,
            walk_in_sms_consent: {
              agreed: smsConsent,
              agreed_at: smsConsentAt,
              phone: null,
              text: smsConsentText,
              stored_at: new Date().toISOString(),
            },
          },
        },
        { onConflict: 'appointment_id' },
      );
    await admin
      .from('appointments')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', appointmentId);
    revalidatePath('/tech');
    revalidatePath('/tech/workflow');
    return { ok: true };
  }

  const { data: template } = await admin
    .from('agreement_templates')
    .select('id, version, body, title')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const totalCents = typeof A.base_price_cents === 'number' ? A.base_price_cents : 0;
  const depCents = typeof A.deposit_amount_cents === 'number' ? A.deposit_amount_cents : 0;
  const depositNote =
    depCents > 0
      ? `Deposit collected or due: $${(depCents / 100).toFixed(2)} (see booking / Stripe).`
      : 'Walk-in / field job: deposit may be $0 unless otherwise collected.';

  const { uiVehicleLabel } = await import('@/lib/vehicle-pricing');
  const classLabel = uiVehicleLabel(String(A.vehicle_class ?? 'sedan'));
  const serviceLabel = (A.service_slug ?? 'service').replace(/-/g, ' ');

  const snapshot = input.agreementSnapshotOverride?.trim()
    ? input.agreementSnapshotOverride.trim()
    : template?.body?.trim()
      ? String(template.body)
      : buildNativeAgreementSnapshot({
        customerName: String(A.guest_name ?? signerLegalName).trim() || signerLegalName,
        customerEmail: A.guest_email,
        customerPhone: formatUsPhoneDisplay(A.guest_phone),
        vehicleDescription: String(A.vehicle_description ?? '').trim() || 'See job notes.',
        serviceLabel,
        vehicleClassLabel: classLabel,
        totalDollars: (totalCents / 100).toFixed(2),
        depositNote,
        technicianName: `${witnessName} (${witnessRole.replace(/_/g, ' ')})`,
      });

  const insertRow: Record<string, unknown> = {
    appointment_id: appointmentId,
    template_id: template?.id ?? null,
    template_version: template?.version ?? 1,
    agreement_snapshot: snapshot,
    signer_legal_name: signerLegalName,
    signature_type: input.signatureType,
    signature_data: input.signatureData ?? null,
    sms_consent: smsConsent,
    sms_consent_at: smsConsentAt,
    sms_consent_text: smsConsentText,
    sms_consent_phone: String(A.guest_phone ?? '').replace(/\D/g, '').slice(0, 10),
    technician_witness_id: session.user.id,
    technician_witness_name: witnessName,
    technician_witness_role: witnessRole,
    technician_witnessed_at: witnessAt,
    ip_address: null,
    user_agent: 'tech_workflow',
    customer_id: A.customer_id ?? null,
    vehicle_id: A.vehicle_id ?? null,
    technician_id: session.user.id,
  };

  const signRes = await insertSignedAgreementFlexible(admin, insertRow);
  if (signRes.error) {
    console.warn('[techSignWalkIn] signed_agreements', signRes.error.message);
    const { data: intakeRow } = await admin.from('intake_submissions').select('form_data').eq('appointment_id', appointmentId).maybeSingle();
    const prevForm = (intakeRow?.form_data as Record<string, unknown>) ?? {};
    const backupForm = {
      ...prevForm,
      walk_in_legal_ack: {
        signer_legal_name: signerLegalName,
        signature_type: input.signatureType,
        signature_data: input.signatureData ?? null,
        sms_consent: smsConsent,
        sms_consent_at: smsConsentAt,
        sms_consent_text: smsConsentText,
        sms_consent_phone: String(A.guest_phone ?? '').replace(/\D/g, '').slice(0, 10),
        technician_witness_id: session.user.id,
        technician_witness_name: witnessName,
        technician_witness_role: witnessRole,
        technician_witnessed_at: witnessAt,
        agreement_snapshot: snapshot,
        stored_at: new Date().toISOString(),
      },
    };
    const intakeUpsert: Record<string, unknown> = {
      appointment_id: appointmentId,
      form_data: backupForm,
    };
    if (typeof A.customer_id === 'string' && A.customer_id) intakeUpsert.customer_id = A.customer_id;
    let iu = await admin.from('intake_submissions').upsert(intakeUpsert, { onConflict: 'appointment_id' });
    if (iu.error && /agreement_snapshot|column|schema cache/i.test(iu.error.message)) {
      const withSnap = { ...intakeUpsert, agreement_snapshot: snapshot };
      iu = await admin.from('intake_submissions').upsert(withSnap, { onConflict: 'appointment_id' });
    }
    if (iu.error) {
      console.warn('[techSignWalkIn] intake legal backup failed', iu.error.message);
    }
  }

  const { data: consentIntakeRow } = await admin.from('intake_submissions').select('form_data').eq('appointment_id', appointmentId).maybeSingle();
  const consentPrevForm = (consentIntakeRow?.form_data as Record<string, unknown>) ?? {};
  const consentBackupForm = {
    ...consentPrevForm,
    walk_in_sms_consent: {
      agreed: smsConsent,
      agreed_at: smsConsentAt,
      phone: String(A.guest_phone ?? '').replace(/\D/g, '').slice(0, 10),
      text: smsConsentText,
      stored_at: new Date().toISOString(),
    },
    technician_witness: {
      id: session.user.id,
      name: witnessName,
      role: witnessRole,
      witnessed_at: witnessAt,
    },
  };
  await admin
    .from('intake_submissions')
    .upsert(
      {
        appointment_id: appointmentId,
        customer_id: typeof A.customer_id === 'string' && A.customer_id ? A.customer_id : null,
        form_data: consentBackupForm,
      },
      { onConflict: 'appointment_id' },
    );

  const ja = await insertJobAgreementFlexible(admin, {
    appointment_id: appointmentId,
    signer_legal_name: signerLegalName,
    agreement_snapshot: snapshot,
    signature_type: input.signatureType,
    signature_data: input.signatureData ?? null,
    sms_consent: smsConsent,
    sms_consent_at: smsConsentAt,
    sms_consent_text: smsConsentText,
    sms_consent_phone: String(A.guest_phone ?? '').replace(/\D/g, '').slice(0, 10),
    technician_witness_id: session.user.id,
    technician_witness_name: witnessName,
    technician_witness_role: witnessRole,
    technician_witnessed_at: witnessAt,
    template_id: template?.id ?? null,
    template_version: template?.version ?? 1,
    signed_at: new Date().toISOString(),
  });
  if (ja.error && !/duplicate|unique/i.test(ja.error.message)) {
    console.warn('[techSignWalkIn] job_agreements', ja.error.message);
  }

  await admin
    .from('appointments')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', appointmentId);

  revalidatePath('/tech');
  revalidatePath('/tech/workflow');
  return { ok: true };
}

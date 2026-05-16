'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
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

export async function techCreateWalkInJobAction(input: {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  vehicles: WalkInVehicleInput[];
  addOns: string[];
  customerId?: string | null;
  notes?: string;
}): Promise<
  { ok: true; appointmentId: string; accessToken: string; totalCents: number } | { ok: false; error: string }
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
    return { ok: false, error: apptErr || 'Could not create walk-in job' };
  }

  const verify = await admin.from('appointments').select('id').eq('id', appointment.id).maybeSingle();
  if (!verify.data?.id) {
    return { ok: false, error: 'Job was not persisted — check Supabase appointments table and try again.' };
  }

  revalidatePath('/tech');
  revalidatePath('/tech/workflow');
  return { ok: true, appointmentId: appointment.id, accessToken: appointment.access_token, totalCents: totalBaseCents };
}

export async function techSignWalkInAgreementAction(input: {
  appointmentId: string;
  signerLegalName: string;
  signatureType: 'typed' | 'drawn';
  signatureData: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const appointmentId = String(input.appointmentId ?? '').trim();
  const signerLegalName = String(input.signerLegalName ?? '').trim();
  if (!appointmentId || !signerLegalName) return { ok: false, error: 'Missing fields' };

  const session = await getSessionWithProfile();
  if (!session.user?.id) return { ok: false, error: 'Not signed in' };

  let role = parseAppRole(session.profile?.role ?? null);
  if (!session.profile?.role) {
    const em = (session.user.email ?? '').trim().toLowerCase();
    if (em === OWNER_LOGIN_EMAIL) role = 'super_admin';
  }
  if (role !== 'technician') return { ok: false, error: 'Technicians only' };

  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, error: 'Database not configured' };

  const { data: appt, error: fetchErr } = await fetchAppointmentForTechSign(admin, appointmentId);
  if (fetchErr) {
    return { ok: false, error: `Could not load job: ${fetchErr}` };
  }
  if (!appt) {
    return { ok: false, error: 'Job not found — go back to the quote step and tap “Create job & continue” again.' };
  }
  const A = appt;

  if (A.assigned_technician_id !== session.user.id) {
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

  let techName: string | null = null;
  const { data: techProf } = await admin.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle();
  if (techProf && typeof (techProf as { full_name?: string }).full_name === 'string') {
    techName = (techProf as { full_name: string }).full_name.trim() || null;
  }

  const totalCents = typeof A.base_price_cents === 'number' ? A.base_price_cents : 0;
  const depCents = typeof A.deposit_amount_cents === 'number' ? A.deposit_amount_cents : 0;
  const depositNote =
    depCents > 0
      ? `Deposit collected or due: $${(depCents / 100).toFixed(2)} (see booking / Stripe).`
      : 'Walk-in / field job: deposit may be $0 unless otherwise collected.';

  const classLabel = A.vehicle_class === 'suv_truck' ? 'SUV / Truck' : 'Sedan';
  const serviceLabel = (A.service_slug ?? 'service').replace(/-/g, ' ');

  const snapshot = template?.body?.trim()
    ? String(template.body)
    : buildNativeAgreementSnapshot({
        customerName: String(A.guest_name ?? signerLegalName).trim() || signerLegalName,
        customerEmail: A.guest_email,
        customerPhone: A.guest_phone,
        vehicleDescription: String(A.vehicle_description ?? '').trim() || 'See job notes.',
        serviceLabel,
        vehicleClassLabel: classLabel,
        totalDollars: (totalCents / 100).toFixed(2),
        depositNote,
        technicianName: techName,
      });

  const insertRow: Record<string, unknown> = {
    appointment_id: appointmentId,
    template_id: template?.id ?? null,
    template_version: template?.version ?? 1,
    agreement_snapshot: snapshot,
    signer_legal_name: signerLegalName,
    signature_type: input.signatureType,
    signature_data: input.signatureData ?? null,
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

  const ja = await insertJobAgreementFlexible(admin, {
    appointment_id: appointmentId,
    signer_legal_name: signerLegalName,
    agreement_snapshot: snapshot,
    signature_type: input.signatureType,
    signature_data: input.signatureData ?? null,
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

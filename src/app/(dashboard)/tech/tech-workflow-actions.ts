'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { computeQuoteFromInputs, insertAppointmentResilient, type VehicleLineInput } from '@/lib/booking-server-shared';
import { normalizeUsPhone10Digits } from '@/lib/us-phone';

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

  const { data: appt, error: apErr } = await admin
    .from('appointments')
    .select('id, assigned_technician_id')
    .eq('id', appointmentId)
    .maybeSingle();
  if (apErr || !appt) return { ok: false, error: 'Job not found' };
  if ((appt as { assigned_technician_id?: string | null }).assigned_technician_id !== session.user.id) {
    return { ok: false, error: 'This job is not assigned to you' };
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

  if (!template) return { ok: false, error: 'No agreement template configured' };

  const { error: signErr } = await admin.from('signed_agreements').insert({
    appointment_id: appointmentId,
    template_id: template.id,
    template_version: template.version,
    agreement_snapshot: template.body,
    signer_legal_name: signerLegalName,
    signature_type: input.signatureType,
    signature_data: input.signatureData ?? null,
    ip_address: null,
    user_agent: 'tech_workflow',
  });

  if (signErr) return { ok: false, error: signErr.message };

  await admin
    .from('appointments')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', appointmentId);

  revalidatePath('/tech');
  revalidatePath('/tech/workflow');
  return { ok: true };
}

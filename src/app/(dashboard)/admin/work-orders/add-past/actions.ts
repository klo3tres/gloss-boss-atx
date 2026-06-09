'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

function str(v: FormDataEntryValue | null) {
  return String(v ?? '').trim();
}

function cents(v: FormDataEntryValue | null) {
  const n = Number(str(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0;
}

function splitLines(v: FormDataEntryValue | null) {
  return str(v).split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
}

async function requireAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return null;
  return { admin, userId: session.user.id };
}

async function insertWithFallback(table: string, admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>, row: Record<string, unknown>, fallback: Record<string, unknown>) {
  const first = await admin.from(table).insert(row).select('id').maybeSingle();
  if (!first.error && first.data) return String((first.data as Record<string, unknown>).id ?? '');
  const second = await admin.from(table).insert(fallback).select('id').maybeSingle();
  if (second.error) throw new Error(second.error.message);
  return String((second.data as Record<string, unknown> | null)?.id ?? '');
}

export async function addPastJobAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate) return;
  const { admin, userId } = gate;

  const fullName = str(formData.get('customer_name')) || 'Past job customer';
  const email = str(formData.get('email')).toLowerCase();
  const phone = str(formData.get('phone'));
  const address = str(formData.get('address'));
  const serviceDate = str(formData.get('service_date')) || new Date().toISOString().slice(0, 10);
  const completedAt = str(formData.get('completed_at')) || `${serviceDate}T12:00`;
  const serviceSlug = str(formData.get('service_slug')) || 'past-job';
  const vehicleClass = str(formData.get('vehicle_class')) || 'sedan';
  const vehicleDescription = str(formData.get('vehicle_description')) || 'Vehicle not specified';
  const amountCharged = cents(formData.get('amount_charged'));
  const amountPaid = cents(formData.get('amount_paid')) || amountCharged;
  const paymentMethod = str(formData.get('payment_method')) || 'other';
  const includeRevenue = formData.get('include_revenue') !== 'off';
  const sendReceipt = formData.get('send_receipt') === 'on';
  const technicianId = str(formData.get('technician_id')) || null;
  const expenseNotes = str(formData.get('expense_notes'));
  const beforeUrls = splitLines(formData.get('before_photo_urls'));
  const afterUrls = splitLines(formData.get('after_photo_urls'));

  let customerId: string | null = null;
  if (email) {
    const existing = await admin.from('customers').select('id').eq('email', email).maybeSingle();
    if (existing.data?.id) customerId = String(existing.data.id);
  }
  if (!customerId) {
    const row = {
      email: email || null,
      full_name: fullName,
      phone: phone || null,
      address: address || null,
      service_address: address || null,
      archived: false,
    };
    customerId = await insertWithFallback('customers', admin, row, { email: email || `past-job-${Date.now()}@local.invalid`, full_name: fullName, phone: phone || null });
  }

  const scheduledStart = new Date(`${serviceDate}T09:00:00`).toISOString();
  const completedIso = new Date(completedAt).toISOString();
  const appointmentRow = {
    customer_id: customerId,
    status: 'completed',
    payment_status: amountPaid >= amountCharged ? 'paid' : 'balance_due',
    scheduled_start: scheduledStart,
    job_completed_at: completedIso,
    guest_name: fullName,
    guest_email: email || null,
    guest_phone: phone || null,
    service_slug: serviceSlug,
    vehicle_class: vehicleClass,
    vehicle_description: vehicleDescription,
    booking_vehicles: [{ vehicle_description: vehicleDescription, vehicle_class: vehicleClass, service_slug: serviceSlug, price_cents: amountCharged }],
    service_address: address || null,
    base_price_cents: amountCharged,
    deposit_amount_cents: Math.min(amountPaid, amountCharged),
    balance_due_cents: Math.max(0, amountCharged - amountPaid),
    assigned_technician_id: technicianId,
    notes: expenseNotes || 'Past completed work entered by admin.',
    created_by: userId,
    updated_at: new Date().toISOString(),
  };
  const appointmentId = await insertWithFallback('appointments', admin, appointmentRow, {
    customer_id: customerId,
    status: 'completed',
    scheduled_start: scheduledStart,
    guest_name: fullName,
    guest_email: email || null,
    guest_phone: phone || null,
    service_slug: serviceSlug,
    vehicle_class: vehicleClass === 'truck' || vehicleClass === 'suv' ? 'suv_truck' : 'sedan',
    vehicle_description: vehicleDescription,
    base_price_cents: amountCharged,
    deposit_amount_cents: Math.min(amountPaid, amountCharged),
    notes: expenseNotes || 'Past completed work entered by admin.',
    assigned_technician_id: technicianId,
  });

  let paymentId: string | null = null;
  if (amountPaid > 0) {
    paymentId = await insertWithFallback('payments', admin, {
      appointment_id: appointmentId,
      customer_id: customerId,
      amount_cents: amountPaid,
      status: 'succeeded',
      payment_method: paymentMethod,
      payment_kind: paymentMethod,
      paid_at: completedIso,
      exclude_from_revenue: !includeRevenue,
      metadata: { source: 'admin_past_job', send_receipt: sendReceipt },
    }, {
      appointment_id: appointmentId,
      amount_cents: amountPaid,
      status: 'succeeded',
      created_at: completedIso,
    });
  }

  const receiptNumber = `PAST-${completedIso.slice(0, 10).replace(/-/g, '')}-${appointmentId.slice(0, 8)}`;
  await admin.from('receipts').insert({
    appointment_id: appointmentId,
    payment_id: paymentId,
    customer_id: customerId,
    receipt_number: receiptNumber,
    amount_cents: amountPaid,
    final_total_cents: amountCharged,
    payment_method: paymentMethod,
    status: sendReceipt ? 'issued' : 'draft',
    exclude_from_revenue: !includeRevenue,
    metadata: { source: 'admin_past_job', expense_notes: expenseNotes || null },
  });

  const mediaRows = [
    ...beforeUrls.map((url) => ({ appointment_id: appointmentId, uploaded_by: userId, category: 'before', photo_category: 'before', file_url: url, public_url: url, notes: 'Past job before photo' })),
    ...afterUrls.map((url) => ({ appointment_id: appointmentId, uploaded_by: userId, category: 'after', photo_category: 'after', file_url: url, public_url: url, notes: 'Past job after photo' })),
  ];
  if (mediaRows.length > 0) await admin.from('job_media').insert(mediaRows);

  // Automatically insert loyalty stamp for past job
  if (customerId && appointmentId) {
    const { error: stampError } = await admin.from('loyalty_stamps').insert({
      customer_id: customerId,
      appointment_id: appointmentId,
      stamp_count: 1,
      reason: `Completed service (past job): ${serviceSlug.replace(/-/g, ' ')}`,
    });
    if (stampError) {
      console.warn('[add-past-job] failed to insert loyalty stamp', stampError.message);
    }
  }

  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');
  revalidatePath('/admin/receipts');
  redirect(`/admin/work-orders/${appointmentId}?shell=admin`);
}

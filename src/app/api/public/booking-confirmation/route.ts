import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadOrderSnapshot } from '@/lib/order-snapshot-engine';
import { vehiclesFromRow, type Row } from '@/lib/work-order-resolve';
import { enabledExternalPaymentMethods, loadExternalPaymentSettings } from '@/lib/external-payment-settings';

export const runtime = 'nodejs';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

/** Public booking summary for confirmation page (requires access token). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const appointmentId = url.searchParams.get('appointment_id') ?? url.searchParams.get('appointmentId') ?? '';
  const token = url.searchParams.get('token') ?? '';
  if (!appointmentId || !token) {
    return NextResponse.json({ error: 'Missing appointment_id and token' }, { status: 400 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

  const { data: appt } = await admin
    .from('appointments')
    .select('id, access_token, status, guest_name, guest_email, guest_phone, scheduled_start, payment_status, payment_choice, promo_code')
    .eq('id', appointmentId)
    .maybeSingle();

  if (!appt || str((appt as Row).access_token) !== token) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const snap = await loadOrderSnapshot(admin, { appointmentId });
  const job = appt as Row;
  const vehicles = snap?.vehicles ?? vehiclesFromRow(job).map((v, i) => ({
    description: str(v.vehicle_description || v.description) || `Vehicle ${i + 1}`,
    serviceSlug: str(v.service_slug),
    vehicleClass: str(v.vehicle_class),
    priceCents: typeof v.price_cents === 'number' ? v.price_cents : 0,
    addOns: [] as Array<{ label: string; priceCents: number }>,
  }));

  if (snap) {
    for (let i = 0; i < snap.vehicles.length; i++) {
      vehicles[i] = {
        description: snap.vehicles[i]!.description,
        serviceSlug: snap.vehicles[i]!.serviceSlug,
        vehicleClass: snap.vehicles[i]!.vehicleClass,
        priceCents: snap.vehicles[i]!.priceCents,
        addOns: snap.vehicles[i]!.addOns.map((a) => ({ label: a.label, priceCents: a.priceCents })),
      };
    }
  }

  const p = snap?.pricing;
  const [{ data: agreement }, { data: customer }, externalPaymentSettings] = await Promise.all([
    admin.from('signed_agreements').select('id, signed_at').eq('appointment_id', appointmentId).limit(1).maybeSingle(),
    snap?.refs.customerId
      ? admin.from('customers').select('id, auth_user_id').eq('id', snap.refs.customerId).maybeSingle()
      : Promise.resolve({ data: null }),
    loadExternalPaymentSettings(admin),
  ]);
  const status = str(job.status).toLowerCase();
  const appointmentActive = !['cancelled', 'voided', 'deleted'].includes(status);
  const acknowledgementCompleted = Boolean(agreement);
  const depositRequired = (p?.depositCents ?? 0) > 0;
  const depositPaid = (p?.depositPaidCents ?? 0) > 0;
  const paidInFull = (p?.finalTotalCents ?? 0) > 0 && (p?.totalPaidCents ?? 0) >= (p?.finalTotalCents ?? 0);
  const paymentChoice = str(job.payment_choice).toLowerCase();
  const payOnArrival = paymentChoice === 'pay_later' || paymentChoice === 'pay_on_arrival';
  const knownDiscountCents =
    (p?.onlineDiscountCents ?? 0) +
    (p?.multiCarDiscountCents ?? 0) +
    (p?.promoDiscountCents ?? 0) +
    (p?.manualDiscountCents ?? 0);
  const pricingAdjustmentCents = Math.max(
    0,
    (p?.prePromoCents ?? 0) - knownDiscountCents - (p?.finalTotalCents ?? 0),
  );
  const nextStep = !appointmentActive
    ? 'inactive'
    : !acknowledgementCompleted
      ? 'acknowledgement'
      : depositRequired && !depositPaid && !paidInFull && !payOnArrival
        ? 'payment'
        : 'confirmation';
  return NextResponse.json({
    ok: true,
    bookingNumber: appointmentId.slice(0, 8).toUpperCase(),
    guestName: snap?.customer.name ?? str(job.guest_name),
    guestEmail: snap?.customer.email ?? str(job.guest_email),
    guestPhone: snap?.customer.phone ?? str(job.guest_phone),
    scheduledStart: snap?.scheduledStart ?? str(job.scheduled_start),
    serviceAddress: snap?.serviceAddress ?? '',
    vehicles,
    promoCode: snap?.promoCode ?? (str(job.promo_code) || null),
    finalTotalCents: p?.finalTotalCents ?? 0,
    depositCents: p?.depositCents ?? 0,
    depositPaidCents: p?.depositPaidCents ?? 0,
    totalPaidCents: p?.totalPaidCents ?? 0,
    balanceDueCents: p?.remainingBalanceCents ?? 0,
    paymentStatus: snap?.paymentStatus ?? str(job.payment_status),
    externalPaymentMethods: enabledExternalPaymentMethods(externalPaymentSettings),
    onlineDiscountCents: p?.onlineDiscountCents ?? 0,
    multiCarDiscountCents: p?.multiCarDiscountCents ?? 0,
    promoDiscountCents: p?.promoDiscountCents ?? 0,
    manualDiscountCents: p?.manualDiscountCents ?? 0,
    pricingAdjustmentCents,
    sessionState: {
      bookingExists: true,
      appointmentActive,
      acknowledgementCompleted,
      depositRequired,
      depositPaid,
      paidInFull,
      payOnArrival,
      paymentFailed: ['failed', 'payment_failed'].includes(str(job.payment_status).toLowerCase()),
      paymentCancelled: ['cancelled', 'payment_cancelled'].includes(str(job.payment_status).toLowerCase()),
      accountClaimed: Boolean(customer?.auth_user_id),
      workOrderCreated: Boolean(snap?.refs.workOrderId),
      nextStep,
    },
  });
}

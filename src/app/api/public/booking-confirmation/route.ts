import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadOrderSnapshot } from '@/lib/order-snapshot-engine';
import { vehiclesFromRow, type Row } from '@/lib/work-order-resolve';

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
    .select('id, access_token, guest_name, guest_email, guest_phone, scheduled_start, payment_status, promo_code')
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
    onlineDiscountCents: p?.onlineDiscountCents ?? 0,
    multiCarDiscountCents: p?.multiCarDiscountCents ?? 0,
    promoDiscountCents: p?.promoDiscountCents ?? 0,
  });
}

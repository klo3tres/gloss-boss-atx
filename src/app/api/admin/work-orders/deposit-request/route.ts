import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadOrderSnapshot } from '@/lib/order-snapshot-engine';
import { recordJobTimelineEvent } from '@/lib/job-timeline-server';
import { enabledExternalPaymentMethods, loadExternalPaymentSettings } from '@/lib/external-payment-settings';

export const runtime = 'nodejs';

function cents(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function sessionUrl(appointmentId: string, token: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
  return `${base}/book/confirmation?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`;
}

async function loadDepositContext(appointmentId: string) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return null;
  const [{ data: appointment }, snapshot] = await Promise.all([
    admin
      .from('appointments')
      .select('id, access_token, guest_name, guest_email, guest_phone, scheduled_start, service_address, service_city, service_state, service_zip, deposit_percent, deposit_amount_cents, payment_choice, booking_pricing_breakdown')
      .eq('id', appointmentId)
      .maybeSingle(),
    loadOrderSnapshot(admin, { appointmentId }),
  ]);
  if (!appointment || !snapshot) return null;
  return { admin, appointment, snapshot };
}

export async function GET(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const appointmentId = new URL(request.url).searchParams.get('appointmentId')?.trim() ?? '';
  const context = await loadDepositContext(appointmentId);
  if (!context) return NextResponse.json({ ok: false, error: 'Work order not found' }, { status: 404 });
  const { admin, appointment, snapshot } = context;
  const pricing = snapshot.pricing;
  const externalPaymentMethods = enabledExternalPaymentMethods(await loadExternalPaymentSettings(admin));
  const namedDiscountCents =
    pricing.onlineDiscountCents +
    pricing.multiCarDiscountCents +
    pricing.promoDiscountCents +
    pricing.manualDiscountCents;
  return NextResponse.json({
    ok: true,
    customer: snapshot.customer,
    appointment: {
      scheduledStart: snapshot.scheduledStart,
      address: snapshot.serviceAddress,
      vehicles: snapshot.vehicles.map((vehicle) => vehicle.description),
      services: snapshot.vehicles.map((vehicle) => vehicle.serviceSlug.replace(/-/g, ' ')),
    },
    pricing: {
      subtotalCents: pricing.prePromoCents,
      discountCents: Math.max(namedDiscountCents, pricing.prePromoCents - pricing.finalTotalCents),
      creditCents: pricing.creditPaidCents,
      finalTotalCents: pricing.finalTotalCents,
      paidCents: pricing.totalPaidCents,
      depositPercent: cents(appointment.deposit_percent) || cents((appointment.booking_pricing_breakdown as Record<string, unknown> | null)?.depositPercent) || 30,
      depositCents: pricing.depositCents,
      remainingBalanceCents: pricing.remainingBalanceCents,
      remainingAfterDepositCents: Math.max(0, pricing.remainingBalanceCents - pricing.depositCents),
    },
    recipient: { phone: appointment.guest_phone ?? '', email: appointment.guest_email ?? '' },
    secureLink: sessionUrl(appointmentId, String(appointment.access_token ?? '')),
    paymentChoice: appointment.payment_choice ?? 'deposit',
    externalPaymentMethods,
  });
}

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const body = (await request.json()) as {
    appointmentId?: string;
    mode?: 'default' | 'percent' | 'fixed' | 'full' | 'arrival' | 'waive';
    value?: number;
  };
  const appointmentId = body.appointmentId?.trim() ?? '';
  const context = await loadDepositContext(appointmentId);
  if (!context) return NextResponse.json({ ok: false, error: 'Work order not found' }, { status: 404 });
  const { admin, appointment, snapshot } = context;
  const total = snapshot.pricing.finalTotalCents;
  const paid = snapshot.pricing.totalPaidCents;
  const defaultPercent = cents(appointment.deposit_percent) || cents((appointment.booking_pricing_breakdown as Record<string, unknown> | null)?.depositPercent) || 30;
  const mode = body.mode ?? 'default';
  const percent = mode === 'percent' ? Math.min(100, cents(body.value)) : mode === 'full' ? 100 : mode === 'arrival' || mode === 'waive' ? 0 : defaultPercent;
  const requested = mode === 'fixed' ? cents(Number(body.value) * 100) : Math.round(total * percent / 100);
  const depositCents = Math.min(Math.max(0, total - paid), requested);
  const paymentChoice = mode === 'arrival' ? 'pay_on_arrival' : mode === 'waive' ? 'none' : mode === 'full' ? 'full' : 'deposit';
  const breakdown = appointment.booking_pricing_breakdown && typeof appointment.booking_pricing_breakdown === 'object'
    ? { ...appointment.booking_pricing_breakdown, depositPercent: percent, depositCents, depositRequiredCents: depositCents }
    : { depositPercent: percent, depositCents, depositRequiredCents: depositCents, finalTotalCents: total };
  const { error } = await admin.from('appointments').update({
    deposit_percent: percent,
    deposit_amount_cents: depositCents,
    payment_choice: paymentChoice,
    payment_status: mode === 'arrival' ? 'pay_on_arrival' : mode === 'waive' ? 'no_deposit_required' : 'awaiting_payment',
    booking_pricing_breakdown: breakdown,
    updated_at: new Date().toISOString(),
  }).eq('id', appointmentId);
  if (error) return NextResponse.json({ ok: false, error: 'Could not update deposit request' }, { status: 500 });
  await recordJobTimelineEvent(admin, {
    appointmentId,
    eventType: 'deposit_requested',
    meta: { action: 'deposit_request_prepared', deposit_cents: depositCents, mode, customer_contacted: false },
  });
  return NextResponse.json({
    ok: true,
    depositCents,
    remainingAfterDepositCents: Math.max(0, total - paid - depositCents),
    secureLink: sessionUrl(appointmentId, String(appointment.access_token ?? '')),
  });
}

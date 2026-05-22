import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveWorkOrder } from '@/lib/work-order-resolve';
import { buildReceiptPdfBytes } from '@/lib/receipt-pdf';
import { displayChicago, displayLabel, displayMoney, displayPhone, displayText, str } from '@/lib/display-format';
import { GLOSS_BOSS_BRAND_NAME } from '@/lib/branding';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function obj(v: unknown): Row {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {};
}

function address(r: Row) {
  return [r.service_address, r.service_city, r.service_state, r.service_zip].map(str).filter(Boolean).join(', ');
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  const role = session.profile?.role ?? null;
  const allowed = session.user && (isAdminLevel(role) || role === 'technician' || role === 'customer');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let receipt = (await admin.from('receipts').select('*').eq('id', id).maybeSingle()).data as Row | null;
  if (!receipt) receipt = (await admin.from('receipts').select('*').eq('payment_id', id).maybeSingle()).data as Row | null;
  const paymentId = str(receipt?.payment_id || id);
  const payment = (await admin.from('payments').select('*').eq('id', paymentId).maybeSingle()).data as Row | null;
  if (!receipt && !payment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const appointmentId = str(receipt?.appointment_id || payment?.appointment_id);
  const resolved = appointmentId ? await resolveWorkOrder(admin, appointmentId) : null;
  const job = resolved?.row ?? {};
  const techName = resolved?.technicianName ?? '';

  const pricing = obj(job.booking_pricing_breakdown);
  const vehicles = Array.isArray(job.booking_vehicles) ? (job.booking_vehicles as Row[]) : [];
  const vehicleRows = vehicles.length
    ? vehicles.map((v, i) => ({
        name: str(v.vehicle_description || v.description) || `Vehicle ${i + 1}`,
        service: displayLabel(v.service_slug || job.service_slug),
        color: str(v.vehicle_color || v.color) || '—',
        price: typeof v.price_cents === 'number' ? displayMoney(v.price_cents) : displayMoney(job.base_price_cents),
      }))
    : [{ name: str(job.vehicle_description) || 'Service', service: displayLabel(job.service_slug), color: '—', price: displayMoney(job.base_price_cents) }];

  const pdf = buildReceiptPdfBytes({
    receiptNumber: str(receipt?.receipt_number) || `RCPT-${paymentId.slice(0, 8)}`,
    brandName: GLOSS_BOSS_BRAND_NAME,
    customerName: displayText(job.guest_name, 'Customer'),
    customerEmail: str(job.guest_email),
    customerPhone: displayPhone(job.guest_phone),
    serviceAddress: address(job),
    paidAt: displayChicago(payment?.paid_at || payment?.created_at || receipt?.created_at),
    serviceAt: displayChicago(job.scheduled_start),
    completedAt: displayChicago(job.job_completed_at || job.completed_at),
    jobStartedAt: displayChicago(job.job_started_at),
    jobCompletedAt: displayChicago(job.job_completed_at || job.completed_at),
    technicianName: techName,
    method: displayLabel(payment?.payment_method || receipt?.payment_method),
    status: displayLabel(payment?.status || receipt?.status),
    vehicles: vehicleRows,
    baseTotal: displayMoney(pricing.baseTotalCents ?? job.base_price_cents),
    discounts: displayMoney((pricing.onlineDiscountCents as number) ?? 0),
    taxAmount: typeof pricing.taxCents === 'number' ? displayMoney(pricing.taxCents) : '',
    finalTotal: displayMoney(pricing.finalTotalCents ?? job.base_price_cents ?? payment?.amount_cents),
    depositPaid: displayMoney(job.deposit_amount_cents),
    fullPaid: displayMoney(payment?.amount_cents),
    remainingBalance: displayMoney(job.balance_due_cents),
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${str(receipt?.receipt_number) || 'receipt'}.pdf"`,
    },
  });
}

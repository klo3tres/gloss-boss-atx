import type { SupabaseClient } from '@supabase/supabase-js';
import { loadOrderSnapshot, type OrderSnapshot } from '@/lib/order-snapshot-engine';

export type CustomerApptSnapshotView = {
  appointmentId: string;
  status: string;
  scheduledStart: string;
  serviceAddress: string;
  vehicles: Array<{
    description: string;
    serviceSlug: string;
    vehicleClass: string;
    priceCents: number;
    addOns: Array<{ label: string; priceCents: number }>;
  }>;
  finalTotalCents: number;
  depositPaidCents: number;
  totalPaidCents: number;
  balanceDueCents: number;
  paymentStatus: string;
  promoCode: string | null;
  receipts: Array<{ receiptNumber: string; amountCents: number; createdAt: string }>;
  payments: Array<{ amountCents: number; status: string }>;
  hasAgreement: boolean;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export async function loadCustomerSnapshotForAppointment(
  admin: SupabaseClient,
  appointmentId: string,
  customerId?: string | null,
): Promise<CustomerApptSnapshotView | null> {
  const snap = await loadOrderSnapshot(admin, { appointmentId, customerId: customerId ?? undefined });
  if (!snap) return null;
  return mapOrderSnapshotToCustomerView(snap);
}

export function mapOrderSnapshotToCustomerView(snap: OrderSnapshot): CustomerApptSnapshotView {
  const p = snap.pricing;
  return {
    appointmentId: snap.refs.appointmentId,
    status: snap.jobStatus,
    scheduledStart: snap.scheduledStart,
    serviceAddress: snap.serviceAddress,
    vehicles: snap.vehicles.map((v) => ({
      description: v.description || [v.year, v.make, v.model].filter(Boolean).join(' ') || `Vehicle ${v.index + 1}`,
      serviceSlug: v.serviceSlug,
      vehicleClass: v.vehicleClass,
      priceCents: v.priceCents,
      addOns: v.addOns.map((a) => ({ label: a.label, priceCents: a.priceCents })),
    })),
    finalTotalCents: p.finalTotalCents,
    depositPaidCents: p.depositPaidCents,
    totalPaidCents: p.totalPaidCents,
    balanceDueCents: p.remainingBalanceCents,
    paymentStatus: snap.paymentStatus || (p.remainingBalanceCents <= 0 ? 'paid' : p.depositPaidCents > 0 ? 'deposit_paid' : 'unpaid'),
    promoCode: snap.promoCode || str(snap.originalBookingBreakdown.promo_code) || null,
    receipts: [],
    payments: snap.payments.all.map((pay) => ({ amountCents: pay.amountCents, status: pay.status })),
    hasAgreement: snap.agreement.signed,
  };
}

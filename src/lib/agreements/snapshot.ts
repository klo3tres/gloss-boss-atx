import type { SupabaseClient } from '@supabase/supabase-js';
import { buildNativeAgreementSnapshot } from '@/lib/default-gloss-boss-agreement';
import { resolveOrderLedger } from '@/lib/order-ledger';

function money(cents: number) {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

export async function buildAgreementSnapshotForOrder(
  admin: SupabaseClient,
  input: { appointmentId?: string | null; workOrderId?: string | null },
): Promise<string | null> {
  const ledger = await resolveOrderLedger(admin, {
    appointmentId: input.appointmentId || undefined,
    workOrderId: input.workOrderId || input.appointmentId || undefined,
    sourceHint: 'appointment',
  });
  if (!ledger) return null;

  const vehicles = ledger.vehicles.map((vehicle, index) => {
    const identity = [vehicle.year, vehicle.make, vehicle.model, vehicle.color].filter(Boolean).join(' ');
    const addOns = vehicle.addOns.map((addOn) => `${addOn.label} (${money(addOn.priceCents)})`).join(', ');
    return [
      `${index + 1}. ${identity || vehicle.description || 'Vehicle on work order'}`,
      `   Service: ${vehicle.serviceTitle || vehicle.serviceSlug || 'Detailing service'} (${money(vehicle.bookedPriceCents || vehicle.basePriceCents)})`,
      addOns ? `   Add-ons: ${addOns}` : '',
    ].filter(Boolean).join('\n');
  });
  const serviceLines = ledger.vehicles
    .map((vehicle) => vehicle.serviceTitle || vehicle.serviceSlug)
    .filter(Boolean)
    .join(', ');
  const depositNote = [
    `Service subtotal: ${money(ledger.totals.serviceSubtotalCents)}.`,
    `Add-ons: ${money(ledger.totals.addOnSubtotalCents)}.`,
    `Discounts: -${money(ledger.totals.totalDiscountCents)}.`,
    `Paid: ${money(ledger.totals.totalPaidCents)}.`,
    `Remaining balance: ${money(ledger.totals.balanceDueCents)}.`,
  ].join(' ');

  const base = buildNativeAgreementSnapshot({
    customerName: ledger.customer.name,
    customerEmail: ledger.customer.email,
    customerPhone: ledger.customer.phone,
    vehicleDescription: vehicles.join('\n') || 'Vehicle on work order',
    serviceLabel: serviceLines || 'Mobile detailing',
    vehicleClassLabel: ledger.vehicles.map((vehicle) => vehicle.vehicleClass).filter(Boolean).join(', ') || 'As booked',
    totalDollars: (ledger.totals.finalTotalCents / 100).toFixed(2),
    depositNote,
  });

  return `${base}\n\n--- APPOINTMENT & PRICING SNAPSHOT ---\nService address: ${ledger.customer.address || 'Address on file'}\nAppointment: ${ledger.schedule.appointmentAtDisplay || ledger.schedule.appointmentAt || 'Scheduling pending'}\nOriginal subtotal: ${money(ledger.totals.grossSubtotalCents)}\nDiscounts: -${money(ledger.totals.totalDiscountCents)}\nFinal agreed total: ${money(ledger.totals.finalTotalCents)}\nPaid: ${money(ledger.totals.totalPaidCents)}\nRemaining balance: ${money(ledger.totals.balanceDueCents)}`;
}

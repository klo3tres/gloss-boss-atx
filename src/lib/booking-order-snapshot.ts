import type { BookingPricingBreakdown } from '@/lib/booking-pricing';

export type BookingOrderSnapshot = {
  version: 1;
  capturedAt: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  serviceAddress: string;
  scheduledStart: string;
  vehicles: Array<{
    serviceSlug: string;
    vehicleClass: string;
    vehicleDescription: string;
    vehicleColor: string;
    priceCents: number;
  }>;
  addOnSlugs: string[];
  addOnCents: number;
  promoCode: string | null;
  paymentChoice: 'deposit' | 'full';
  pricing: BookingPricingBreakdown;
};

/** Embed on appointment for receipts, work orders, Stripe metadata alignment. */
export function buildBookingOrderSnapshot(params: {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  serviceAddress: string;
  scheduledStart: string;
  vehicles: BookingOrderSnapshot['vehicles'];
  addOnSlugs: string[];
  addOnCents: number;
  promoCode: string | null;
  paymentChoice: 'deposit' | 'full';
  pricing: BookingPricingBreakdown;
}): BookingOrderSnapshot {
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    guestName: params.guestName,
    guestEmail: params.guestEmail,
    guestPhone: params.guestPhone,
    serviceAddress: params.serviceAddress,
    scheduledStart: params.scheduledStart,
    vehicles: params.vehicles,
    addOnSlugs: params.addOnSlugs,
    addOnCents: params.addOnCents,
    promoCode: params.promoCode,
    paymentChoice: params.paymentChoice,
    pricing: params.pricing,
  };
}

export function mergeSnapshotIntoBreakdown(
  priced: BookingPricingBreakdown,
  snapshot: BookingOrderSnapshot,
): BookingPricingBreakdown & { orderSnapshot: BookingOrderSnapshot } {
  return {
    ...priced,
    orderSnapshot: snapshot,
  };
}

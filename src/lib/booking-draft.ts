export const BOOKING_DRAFT_KEY = 'gb_booking_draft_v1';

export type BookingDraftVehicle = {
  serviceSlug: string;
  vehicleClass: string;
  vehicleDescription: string;
  vehicleColor: string;
  addOnSlugs: string[];
};

export type BookingDraft = {
  version: 1;
  savedAt: string;
  serviceSlug: string;
  vehicleClass: string;
  vehicleDescription: string;
  vehicleColor: string;
  primaryAddOnSlugs: string[];
  extraVehicles: BookingDraftVehicle[];
  paymentChoice: 'deposit' | 'full';
  promoCode: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  serviceAddress: string;
  serviceCity: string;
  serviceState: string;
  serviceZip: string;
  scheduledStart: string;
  accessNotes: string;
  hasWater: boolean | null;
  hasPower: boolean | null;
  step?: number;
};

export function readBookingDraft(): BookingDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BOOKING_DRAFT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as BookingDraft;
    if (p?.version !== 1) return null;
    return p;
  } catch {
    return null;
  }
}

export function writeBookingDraft(draft: BookingDraft): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    /* quota */
  }
}

export function clearBookingDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(BOOKING_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

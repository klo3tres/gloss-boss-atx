export const BOOKING_DRAFT_KEY = 'gb_booking_draft_v1';

/** Inactivity window before vehicles/services/schedule are cleared (name + email kept). */
export const BOOKING_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

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

export function isBookingDraftExpired(savedAt: string | undefined, now = Date.now()): boolean {
  if (!savedAt) return true;
  const t = Date.parse(savedAt);
  if (Number.isNaN(t)) return true;
  return now - t > BOOKING_DRAFT_TTL_MS;
}

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

export type BookingDraftLoadResult =
  | { kind: 'none' }
  | { kind: 'fresh'; draft: BookingDraft }
  | { kind: 'expired'; guestName: string; guestEmail: string; guestPhone: string };

/** Load draft; if expired, clear vehicle/schedule fields and keep contact info only. */
export function loadBookingDraftForWizard(): BookingDraftLoadResult {
  const draft = readBookingDraft();
  if (!draft) return { kind: 'none' };
  if (!isBookingDraftExpired(draft.savedAt)) return { kind: 'fresh', draft };

  const guestName = draft.guestName ?? '';
  const guestEmail = draft.guestEmail ?? '';
  const guestPhone = draft.guestPhone ?? '';
  writeBookingDraft({
    version: 1,
    savedAt: new Date().toISOString(),
    serviceSlug: '',
    vehicleClass: 'sedan',
    vehicleDescription: '',
    vehicleColor: '',
    primaryAddOnSlugs: [],
    extraVehicles: [],
    paymentChoice: 'deposit',
    promoCode: '',
    guestName,
    guestEmail,
    guestPhone,
    serviceAddress: '',
    serviceCity: '',
    serviceState: '',
    serviceZip: '',
    scheduledStart: '',
    accessNotes: '',
    hasWater: null,
    hasPower: null,
  });
  return { kind: 'expired', guestName, guestEmail, guestPhone };
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

import { parseBookingAvailabilityRules, type BookingAvailabilityRules } from '@/lib/booking-availability';

export type BookingAvailabilityConfig = BookingAvailabilityRules & {
  blackoutDates: string[];
};

export function parseBookingAvailabilityConfig(raw: unknown): BookingAvailabilityConfig {
  const base = parseBookingAvailabilityRules(raw);
  if (!raw || typeof raw !== 'object') {
    return { ...base, blackoutDates: [] };
  }
  const o = raw as Record<string, unknown>;
  const blackoutDates = Array.isArray(o.blackoutDates)
    ? o.blackoutDates.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())).map((d) => d.trim())
    : [];
  return { ...base, blackoutDates };
}

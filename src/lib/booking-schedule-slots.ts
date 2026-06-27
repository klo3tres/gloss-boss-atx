import {
  DEFAULT_BOOKING_AVAILABILITY,
  type BookingAvailabilityRules,
  type DayTimeWindow,
  isBookingSlotAllowed,
} from '@/lib/booking-availability';
import type { BookingAvailabilityConfig } from '@/lib/booking-availability-config';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local YYYY-MM-DD */
export function dateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${mo}-${day}`;
}

function minutesToClock(m: number): { h: number; min: number } {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return { h, min };
}

function formatSlotLabel(h: number, min: number): string {
  const ap = h >= 12 ? 'PM' : 'AM';
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${pad2(min)} ${ap}`;
}

function windowForWeekdayLocal(day: number, rules: BookingAvailabilityRules): DayTimeWindow | null {
  const fri = rules.fridayWindow ?? DEFAULT_BOOKING_AVAILABILITY.fridayWindow!;
  const sat = rules.saturdayWindow ?? DEFAULT_BOOKING_AVAILABILITY.saturdayWindow!;
  const sun = rules.sundayWindow ?? DEFAULT_BOOKING_AVAILABILITY.sundayWindow!;
  if (day === 0 && rules.allowSunday) return sun;
  if (day === 6 && rules.allowSaturday) return sat;
  if (day === 5) return fri;
  return null;
}

/**
 * 15-minute start times within the allowed window for a local calendar date.
 */
export function getTimeSlotsForDate(dateKey: string, rules: BookingAvailabilityConfig): { value: string; label: string }[] {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return [];
  const w = windowForWeekdayLocal(d.getDay(), rules);
  if (!w) return [];

  const startM = w.startHour * 60 + w.startMinute;
  const endM = w.endHour * 60 + w.endMinute;
  const step = rules.slotIntervalMinutes ?? 15;
  const out: { value: string; label: string }[] = [];
  for (let m = startM; m <= endM; m += step) {
    const { h, min } = minutesToClock(m);
    const value = `${pad2(h)}:${pad2(min)}`;
    out.push({ value, label: formatSlotLabel(h, min) });
  }
  return out;
}

export function dateHasFutureBookableSlot(dateKey: string, rules: BookingAvailabilityConfig, now = new Date()): boolean {
  const slots = getTimeSlotsForDate(dateKey, rules);
  const blackouts = rules.blackoutDates ?? [];
  if (blackouts.includes(dateKey)) return false;

  for (const s of slots) {
    const dt = new Date(`${dateKey}T${s.value}:00`);
    if (Number.isNaN(dt.getTime())) continue;
    if (dt.getTime() < now.getTime() - 60_000) continue;
    if (isBookingSlotAllowed(dt, rules)) return true;
  }
  return false;
}

/**
 * Next N calendar dates that have at least one valid future slot.
 */
export function getBookableDateKeys(
  rules: BookingAvailabilityConfig,
  opts?: { start?: Date; maxScanDays?: number; limit?: number },
): string[] {
  const start = opts?.start ?? new Date();
  const maxScan = opts?.maxScanDays ?? 120;
  const limit = opts?.limit ?? 56;
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0, 0);
  const now = new Date();

  for (let i = 0; i < maxScan && keys.length < limit; i++) {
    const key = dateKeyLocal(cursor);
    if (dateHasFutureBookableSlot(key, rules, now)) keys.push(key);
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

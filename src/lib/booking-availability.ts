/** Default: online booking allowed Fri after 5pm, all day Sat & Sun (Austin mobile detailing). */
export type BookingAvailabilityRules = {
  allowFridayAfterHour: number;
  allowFridayAfterMinute: number;
  allowSaturday: boolean;
  allowSunday: boolean;
  /** When true, Mon–Thu and Fri before cutoff are also allowed (admin override). */
  allowAllOtherDays: boolean;
  /** ISO date strings YYYY-MM-DD — blocked all day */
  blackoutDates?: string[];
};

export const DEFAULT_BOOKING_AVAILABILITY: BookingAvailabilityRules = {
  allowFridayAfterHour: 17,
  allowFridayAfterMinute: 0,
  allowSaturday: true,
  allowSunday: true,
  allowAllOtherDays: false,
};

export function parseBookingAvailabilityRules(raw: unknown): BookingAvailabilityRules {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_BOOKING_AVAILABILITY };
  const o = raw as Record<string, unknown>;
  return {
    allowFridayAfterHour:
      typeof o.allowFridayAfterHour === 'number' && o.allowFridayAfterHour >= 0 && o.allowFridayAfterHour <= 23
        ? o.allowFridayAfterHour
        : DEFAULT_BOOKING_AVAILABILITY.allowFridayAfterHour,
    allowFridayAfterMinute:
      typeof o.allowFridayAfterMinute === 'number' && o.allowFridayAfterMinute >= 0 && o.allowFridayAfterMinute <= 59
        ? o.allowFridayAfterMinute
        : DEFAULT_BOOKING_AVAILABILITY.allowFridayAfterMinute,
    allowSaturday: typeof o.allowSaturday === 'boolean' ? o.allowSaturday : DEFAULT_BOOKING_AVAILABILITY.allowSaturday,
    allowSunday: typeof o.allowSunday === 'boolean' ? o.allowSunday : DEFAULT_BOOKING_AVAILABILITY.allowSunday,
    allowAllOtherDays:
      typeof o.allowAllOtherDays === 'boolean' ? o.allowAllOtherDays : DEFAULT_BOOKING_AVAILABILITY.allowAllOtherDays,
  };
}

function isFridayAfterCutoff(date: Date, rules: BookingAvailabilityRules): boolean {
  const h = date.getHours();
  const m = date.getMinutes();
  if (h > rules.allowFridayAfterHour) return true;
  if (h === rules.allowFridayAfterHour && m >= rules.allowFridayAfterMinute) return true;
  return false;
}

/** Returns whether the chosen local datetime is within allowed booking windows. */
function dateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isBookingSlotAllowed(date: Date, rules: BookingAvailabilityRules = DEFAULT_BOOKING_AVAILABILITY): boolean {
  if (Number.isNaN(date.getTime())) return false;

  const blackouts = rules.blackoutDates ?? [];
  if (blackouts.includes(dateKeyLocal(date))) return false;

  if (rules.allowAllOtherDays) return true;

  const day = date.getDay();
  if (day === 0 && rules.allowSunday) return true;
  if (day === 6 && rules.allowSaturday) return true;
  if (day === 5 && isFridayAfterCutoff(date, rules)) return true;
  return false;
}

export function bookingAvailabilityHint(rules: BookingAvailabilityRules = DEFAULT_BOOKING_AVAILABILITY): string {
  if (rules.allowAllOtherDays) return 'Select any available date and time.';
  const h12 = rules.allowFridayAfterHour > 12 ? rules.allowFridayAfterHour - 12 : rules.allowFridayAfterHour;
  const ampm = rules.allowFridayAfterHour >= 12 ? 'PM' : 'AM';
  const parts: string[] = [];
  parts.push(`Friday after ${h12}:${String(rules.allowFridayAfterMinute).padStart(2, '0')} ${ampm}`);
  if (rules.allowSaturday) parts.push('all day Saturday');
  if (rules.allowSunday) parts.push('all day Sunday');
  return `Online booking is available ${parts.join(', ')}.`;
}

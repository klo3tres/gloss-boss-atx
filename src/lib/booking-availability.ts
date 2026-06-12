/** Booking windows: Fri 5–9 PM, Sat/Sun 7:30 AM–7 PM (Austin mobile detailing). */

export type DayTimeWindow = {

  startHour: number;

  startMinute: number;

  endHour: number;

  endMinute: number;

};



export type BookingAvailabilityRules = {

  allowFridayAfterHour: number;

  allowFridayAfterMinute: number;

  allowSaturday: boolean;

  allowSunday: boolean;

  allowAllOtherDays: boolean;

  blackoutDates?: string[];

  fridayWindow?: DayTimeWindow;

  saturdayWindow?: DayTimeWindow;

  sundayWindow?: DayTimeWindow;

};



const DEFAULT_FRIDAY: DayTimeWindow = { startHour: 17, startMinute: 0, endHour: 19, endMinute: 30 };

const DEFAULT_WEEKEND: DayTimeWindow = { startHour: 7, startMinute: 30, endHour: 19, endMinute: 0 };



export const DEFAULT_BOOKING_AVAILABILITY: BookingAvailabilityRules = {

  allowFridayAfterHour: 17,

  allowFridayAfterMinute: 0,

  allowSaturday: true,

  allowSunday: true,

  allowAllOtherDays: false,

  fridayWindow: DEFAULT_FRIDAY,

  saturdayWindow: DEFAULT_WEEKEND,

  sundayWindow: DEFAULT_WEEKEND,

};



function parseWindow(raw: unknown, fallback: DayTimeWindow): DayTimeWindow {

  if (!raw || typeof raw !== 'object') return fallback;

  const o = raw as Record<string, unknown>;

  const sh = typeof o.startHour === 'number' ? o.startHour : fallback.startHour;

  const sm = typeof o.startMinute === 'number' ? o.startMinute : fallback.startMinute;

  const eh = typeof o.endHour === 'number' ? o.endHour : fallback.endHour;

  const em = typeof o.endMinute === 'number' ? o.endMinute : fallback.endMinute;

  return {

    startHour: Math.min(23, Math.max(0, sh)),

    startMinute: Math.min(59, Math.max(0, sm)),

    endHour: Math.min(23, Math.max(0, eh)),

    endMinute: Math.min(59, Math.max(0, em)),

  };

}



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

    fridayWindow: parseWindow(o.fridayWindow, DEFAULT_FRIDAY),

    saturdayWindow: parseWindow(o.saturdayWindow, DEFAULT_WEEKEND),

    sundayWindow: parseWindow(o.sundayWindow, DEFAULT_WEEKEND),

  };

}



function minutesOfDay(d: Date): number {

  return d.getHours() * 60 + d.getMinutes();

}



function inWindow(d: Date, w: DayTimeWindow): boolean {

  const m = minutesOfDay(d);

  const start = w.startHour * 60 + w.startMinute;

  const end = w.endHour * 60 + w.endMinute;

  return m >= start && m <= end;

}



function dateKeyLocal(d: Date): string {

  const y = d.getFullYear();

  const mo = String(d.getMonth() + 1).padStart(2, '0');

  const day = String(d.getDate()).padStart(2, '0');

  return `${y}-${mo}-${day}`;

}



/** Returns whether the chosen local datetime is within allowed booking windows. */

export function isBookingSlotAllowed(date: Date, rules: BookingAvailabilityRules = DEFAULT_BOOKING_AVAILABILITY): boolean {

  if (Number.isNaN(date.getTime())) return false;



  const now = new Date();

  if (date.getTime() < now.getTime() - 60_000) return false;



  const blackouts = rules.blackoutDates ?? [];

  if (blackouts.includes(dateKeyLocal(date))) return false;



  if (rules.allowAllOtherDays) return true;



  const day = date.getDay();

  const fri = rules.fridayWindow ?? DEFAULT_FRIDAY;

  const sat = rules.saturdayWindow ?? DEFAULT_WEEKEND;

  const sun = rules.sundayWindow ?? DEFAULT_WEEKEND;



  if (day === 0 && rules.allowSunday) return inWindow(date, sun);

  if (day === 6 && rules.allowSaturday) return inWindow(date, sat);

  if (day === 5) return inWindow(date, fri);



  return false;

}



export function bookingAvailabilityHint(rules: BookingAvailabilityRules = DEFAULT_BOOKING_AVAILABILITY): string {

  if (rules.allowAllOtherDays) return 'Select any available date and time.';

  const fri = rules.fridayWindow ?? DEFAULT_FRIDAY;

  const sat = rules.saturdayWindow ?? DEFAULT_WEEKEND;

  const sun = rules.sundayWindow ?? DEFAULT_WEEKEND;

  const fmt = (w: DayTimeWindow) => {

    const sh = w.startHour > 12 ? w.startHour - 12 : w.startHour === 0 ? 12 : w.startHour;

    const eh = w.endHour > 12 ? w.endHour - 12 : w.endHour === 0 ? 12 : w.endHour;

    const sap = w.startHour >= 12 ? 'PM' : 'AM';

    const eap = w.endHour >= 12 ? 'PM' : 'AM';

    return `${sh}:${String(w.startMinute).padStart(2, '0')} ${sap} – ${eh}:${String(w.endMinute).padStart(2, '0')} ${eap}`;

  };

  const parts: string[] = [];

  parts.push(`Friday ${fmt(fri)}`);

  if (rules.allowSaturday) parts.push(`Saturday ${fmt(sat)}`);

  if (rules.allowSunday) parts.push(`Sunday ${fmt(sun)}`);

  return `Online booking: ${parts.join(' · ')}.`;

}



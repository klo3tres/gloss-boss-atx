import { dateKeyChicago, periodBoundsChicago } from '@/lib/chicago-time';

/** Month bounds in Chicago for feed queries */
export function monthFeedBounds(year: number, monthIndex: number) {
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const { start, end } = periodBoundsChicago('monthly', monthKey);
  return { from: start, to: end, monthKey };
}

export function dayKeyInRange(dayKey: string, fromIso: string, toIso: string) {
  const fromKey = dateKeyChicago(fromIso);
  const toKey = dateKeyChicago(toIso);
  return dayKey >= fromKey && dayKey <= toKey;
}

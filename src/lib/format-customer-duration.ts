/** Customer-facing duration: 105 → "1 hr 45 min", 180 → "3 hrs", 60 → "1 hr". */
export function formatCustomerDuration(minutes: number): string {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} min`;
  const hrs = Math.floor(m / 60);
  const mins = m % 60;
  const hrLabel = hrs === 1 ? '1 hr' : `${hrs} hrs`;
  if (mins === 0) return hrLabel;
  return `${hrLabel} ${mins} min`;
}

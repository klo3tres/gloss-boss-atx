import { addonDurationMinutes, BOOKING_BUFFER_MINUTES } from '@/lib/addon-vehicle-pricing';

export type VehicleDurationLine = {
  serviceSlug: string;
  vehicleClass: string;
  addOnSlugs?: string[];
};

/** Estimated service duration in minutes (mobile detailing). */
export function serviceDurationMinutes(serviceSlug: string, vehicleClass: string): number {
  const slug = String(serviceSlug ?? '').toLowerCase();
  void vehicleClass;

  if (slug.includes('ceramic')) return 2 * 24 * 60;
  if (slug.includes('full')) return 240;
  if (slug.includes('interior')) return 150;
  if (slug.includes('exterior-detail')) return 180;
  if (slug.includes('exterior') || slug.includes('wash')) return 90;
  return 120;
}

export function totalBookingDurationMinutes(lines: VehicleDurationLine[]): number {
  if (!lines.length) return 60 + BOOKING_BUFFER_MINUTES;
  const serviceMins = lines.reduce((sum, line) => {
    const base = serviceDurationMinutes(line.serviceSlug, line.vehicleClass);
    const addonMins = (line.addOnSlugs ?? []).reduce((s, slug) => s + addonDurationMinutes(slug), 0);
    return sum + base + addonMins;
  }, 0);
  return serviceMins + BOOKING_BUFFER_MINUTES;
}

export function estimatedEndIso(scheduledStartIso: string, durationMinutes: number): string {
  const start = new Date(scheduledStartIso);
  if (Number.isNaN(start.getTime())) return scheduledStartIso;
  return new Date(start.getTime() + durationMinutes * 60_000).toISOString();
}

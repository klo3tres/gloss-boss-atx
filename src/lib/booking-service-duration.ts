import { addonDurationMinutes, BOOKING_BUFFER_MINUTES } from '@/lib/addon-vehicle-pricing';
import {
  addonDurationFromCatalog,
  serviceDurationFromCatalog,
  type DurationCatalog,
} from '@/lib/booking-duration-catalog';

export type VehicleDurationLine = {
  serviceSlug: string;
  vehicleClass: string;
  addOnSlugs?: string[];
};

/** Estimated service duration in minutes (mobile detailing). */
export function serviceDurationMinutes(serviceSlug: string, vehicleClass: string, catalog?: DurationCatalog): number {
  const fromDb = serviceDurationFromCatalog(serviceSlug, vehicleClass, catalog);
  if (fromDb != null && fromDb > 0) return fromDb;

  const slug = String(serviceSlug ?? '').toLowerCase();
  void vehicleClass;

  if (slug.includes('ceramic')) return 2 * 24 * 60;
  if (slug.includes('full')) return 240;
  if (slug.includes('interior')) return 150;
  if (slug.includes('exterior-detail')) return 180;
  if (slug.includes('exterior') || slug.includes('wash')) return 90;
  return 120;
}

function addonMinutes(slug: string, catalog?: DurationCatalog): number {
  const fromDb = addonDurationFromCatalog(slug, catalog);
  if (fromDb != null && fromDb > 0) return fromDb;
  return addonDurationMinutes(slug);
}

export function totalBookingDurationMinutes(lines: VehicleDurationLine[], catalog?: DurationCatalog): number {
  if (!lines.length) return 60 + BOOKING_BUFFER_MINUTES;
  const serviceMins = lines.reduce((sum, line) => {
    const base = serviceDurationMinutes(line.serviceSlug, line.vehicleClass, catalog);
    const addonMins = (line.addOnSlugs ?? []).reduce((s, slug) => s + addonMinutes(slug, catalog), 0);
    return sum + base + addonMins;
  }, 0);
  return serviceMins + BOOKING_BUFFER_MINUTES;
}

export function estimatedEndIso(scheduledStartIso: string, durationMinutes: number): string {
  const start = new Date(scheduledStartIso);
  if (Number.isNaN(start.getTime())) return scheduledStartIso;
  return new Date(start.getTime() + durationMinutes * 60_000).toISOString();
}

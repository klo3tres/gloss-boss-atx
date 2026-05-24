import { normalizeVehicleClass } from '@/lib/vehicle-pricing';

export type VehicleDurationLine = { serviceSlug: string; vehicleClass: string };

/** Estimated service duration in minutes (mobile detailing). */
export function serviceDurationMinutes(serviceSlug: string, vehicleClass: string): number {
  const slug = String(serviceSlug ?? '').toLowerCase();
  const vc = normalizeVehicleClass(vehicleClass);
  const isLarge = vc === 'suv' || vc === 'truck';

  if (slug.includes('ceramic')) return 24 * 60;
  if (slug.includes('full')) return vc === 'truck' ? 195 : isLarge ? 180 : 150;
  if (slug.includes('interior')) return vc === 'truck' ? 135 : isLarge ? 120 : 90;
  if (slug.includes('exterior') || slug.includes('wash')) return vc === 'truck' ? 90 : isLarge ? 75 : 60;
  return vc === 'truck' ? 100 : isLarge ? 90 : 75;
}

export function totalBookingDurationMinutes(lines: VehicleDurationLine[]): number {
  if (!lines.length) return 60;
  return lines.reduce((sum, line) => sum + serviceDurationMinutes(line.serviceSlug, line.vehicleClass), 0);
}

export function estimatedEndIso(scheduledStartIso: string, durationMinutes: number): string {
  const start = new Date(scheduledStartIso);
  if (Number.isNaN(start.getTime())) return scheduledStartIso;
  return new Date(start.getTime() + durationMinutes * 60_000).toISOString();
}

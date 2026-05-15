import { formatStartingPrice, formatVehiclePrice, type ServicePackage } from '@/lib/site-config';
import { uiVehicleLabel } from '@/lib/vehicle-pricing';

export { formatStartingPrice, formatVehiclePrice };

/** Homepage card — starting at sedan, never $0/TBD. */
export function formatPackageFromPrice(pkg: ServicePackage): string {
  return formatStartingPrice(pkg.sedanPrice);
}

export function formatSedanPrice(pkg: Pick<ServicePackage, 'sedanPrice'>): string {
  return formatVehiclePrice(pkg.sedanPrice);
}

export function formatSuvTruckPrice(pkg: Pick<ServicePackage, 'suvTruckPrice'>): string {
  return formatVehiclePrice(pkg.suvTruckPrice);
}

export function formatVehicleClassLabel(raw: string): string {
  return uiVehicleLabel(raw);
}

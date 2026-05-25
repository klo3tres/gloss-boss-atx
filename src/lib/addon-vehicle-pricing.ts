import { normalizeVehicleClass, type UiVehicleClass } from '@/lib/vehicle-pricing';

/** Class-based add-on cents for booking (DB flat price used as fallback). */
const ADDON_BY_CLASS: Record<string, Record<UiVehicleClass, number>> = {
  'upholstery-shampoo': { sedan: 9500, suv: 12500, truck: 15000 },
  upholstery: { sedan: 9500, suv: 12500, truck: 15000 },
  'clay-bar': { sedan: 4000, suv: 5500, truck: 7000 },
  clay: { sedan: 4000, suv: 5500, truck: 7000 },
  'pet-hair': { sedan: 5000, suv: 5000, truck: 5000 },
  'engine-bay': { sedan: 5000, suv: 5000, truck: 5000 },
  'heavy-condition': { sedan: 5000, suv: 5000, truck: 5000 },
  'heavy-condition-fee': { sedan: 5000, suv: 5000, truck: 5000 },
  odor: { sedan: 7500, suv: 7500, truck: 7500 },
  'odor-treatment': { sedan: 7500, suv: 7500, truck: 7500 },
};

export function addonPriceCentsForVehicle(slug: string, vehicleClass: string, dbFlatCents?: number): number {
  const key = String(slug ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const vc = normalizeVehicleClass(vehicleClass);
  const table = ADDON_BY_CLASS[key];
  if (table?.[vc] != null) return table[vc];
  if (typeof dbFlatCents === 'number' && dbFlatCents > 0) return dbFlatCents;
  return dbFlatCents ?? 0;
}

export function sumPerVehicleAddOnCents(
  vehicles: Array<{ vehicleClass: string; addOnSlugs?: string[] }>,
  addonCatalog: Array<{ slug: string; price_cents: number }>,
): { totalCents: number; lines: Array<{ vehicleIndex: number; slug: string; label: string; cents: number }> } {
  const bySlug = new Map(addonCatalog.map((a) => [a.slug.toLowerCase(), a]));
  let totalCents = 0;
  const lines: Array<{ vehicleIndex: number; slug: string; label: string; cents: number }> = [];
  vehicles.forEach((v, vehicleIndex) => {
    for (const slug of v.addOnSlugs ?? []) {
      const cat = bySlug.get(slug.toLowerCase());
      const cents = addonPriceCentsForVehicle(slug, v.vehicleClass, cat?.price_cents);
      if (cents <= 0) continue;
      totalCents += cents;
      lines.push({
        vehicleIndex,
        slug,
        label: cat?.slug?.replace(/-/g, ' ') ?? slug,
        cents,
      });
    }
  });
  return { totalCents, lines };
}

/** Extra minutes per add-on for slot blocking. */
export function addonDurationMinutes(slug: string): number {
  const key = String(slug ?? '').toLowerCase();
  if (key.includes('upholstery') || key.includes('shampoo')) return 45;
  if (key.includes('clay')) return 25;
  if (key.includes('pet')) return 30;
  if (key.includes('engine')) return 20;
  if (key.includes('heavy') || key.includes('odor')) return 30;
  return 15;
}

export const BOOKING_BUFFER_MINUTES = 15;

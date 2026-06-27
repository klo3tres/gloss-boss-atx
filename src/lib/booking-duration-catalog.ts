import type { SupabaseClient } from '@supabase/supabase-js';
import { addonDurationMinutes } from '@/lib/addon-vehicle-pricing';
import { normalizeVehicleClass, type UiVehicleClass } from '@/lib/vehicle-pricing';

export type DurationEntry = { min: number; max: number };

export type DurationCatalog = {
  services: Map<string, DurationEntry>;
  addons: Map<string, DurationEntry>;
};

const VEHICLE_MULTIPLIER: Record<UiVehicleClass, number> = {
  sedan: 1,
  suv: 1.12,
  truck: 1.2,
};

function normalizeSlug(slug: string) {
  return String(slug ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function entryMinutes(entry: DurationEntry | undefined, fallback: number): number {
  if (!entry) return fallback;
  if (entry.min > 0 && entry.max > 0) return Math.round((entry.min + entry.max) / 2);
  if (entry.max > 0) return entry.max;
  if (entry.min > 0) return entry.min;
  return fallback;
}

export async function loadDurationCatalog(admin: SupabaseClient): Promise<DurationCatalog> {
  const services = new Map<string, DurationEntry>();
  const addons = new Map<string, DurationEntry>();

  const [svcRes, addonRes] = await Promise.all([
    admin.from('services').select('slug, estimated_min_minutes, estimated_max_minutes'),
    admin.from('addons').select('slug, estimated_min_minutes, estimated_max_minutes'),
  ]);

  for (const row of svcRes.data ?? []) {
    const r = row as { slug?: string; estimated_min_minutes?: number; estimated_max_minutes?: number };
    const slug = normalizeSlug(String(r.slug ?? ''));
    if (!slug) continue;
    services.set(slug, {
      min: typeof r.estimated_min_minutes === 'number' ? r.estimated_min_minutes : 0,
      max: typeof r.estimated_max_minutes === 'number' ? r.estimated_max_minutes : 0,
    });
  }

  for (const row of addonRes.data ?? []) {
    const r = row as { slug?: string; estimated_min_minutes?: number; estimated_max_minutes?: number };
    const slug = normalizeSlug(String(r.slug ?? ''));
    if (!slug) continue;
    addons.set(slug, {
      min: typeof r.estimated_min_minutes === 'number' ? r.estimated_min_minutes : 0,
      max: typeof r.estimated_max_minutes === 'number' ? r.estimated_max_minutes : 0,
    });
  }

  return { services, addons };
}

export function serviceDurationFromCatalog(
  serviceSlug: string,
  vehicleClass: string,
  catalog?: DurationCatalog,
): number | null {
  if (!catalog) return null;
  const slug = normalizeSlug(serviceSlug);
  const entry = catalog.services.get(slug);
  const fallback = slug.includes('ceramic') ? 2880 : slug.includes('full') ? 210 : slug.includes('interior') ? 120 : 90;
  const base = entryMinutes(entry, fallback);
  const mult = VEHICLE_MULTIPLIER[normalizeVehicleClass(vehicleClass)] ?? 1;
  return Math.round(base * mult);
}

export function addonDurationFromCatalog(addonSlug: string, catalog?: DurationCatalog): number | null {
  if (!catalog) return null;
  const slug = normalizeSlug(addonSlug);
  const entry = catalog.addons.get(slug);
  if (!entry || (entry.min <= 0 && entry.max <= 0)) return null;
  return entryMinutes(entry, addonDurationMinutes(slug));
}

export function titanDurationEstimateSummary(lines: Array<{ serviceSlug: string; vehicleClass: string; addOnSlugs?: string[] }>, totalMinutes: number) {
  const vehicleCount = lines.length;
  const addonCount = lines.reduce((n, l) => n + (l.addOnSlugs?.length ?? 0), 0);
  if (vehicleCount <= 1 && addonCount === 0) return null;
  return `Titan estimate: ${totalMinutes} min (${vehicleCount} vehicle${vehicleCount === 1 ? '' : 's'}${addonCount ? ` · ${addonCount} add-on${addonCount === 1 ? '' : 's'}` : ''})`;
}

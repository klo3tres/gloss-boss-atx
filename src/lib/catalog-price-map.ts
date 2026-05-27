import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeVehicleClass } from '@/lib/vehicle-pricing';

/** Map `serviceSlug:vehicleClass` → price_cents from live catalog. */
export async function loadCatalogPriceMap(admin: SupabaseClient): Promise<Record<string, number>> {
  const { data: services } = await admin.from('services').select('id, slug');
  const { data: prices } = await admin.from('service_prices').select('service_id, vehicle_class, price_cents');
  const slugById = new Map<string, string>();
  for (const s of services ?? []) {
    const row = s as { id: string; slug: string };
    slugById.set(row.id, row.slug);
  }
  const out: Record<string, number> = {};
  for (const raw of prices ?? []) {
    const p = raw as { service_id: string; vehicle_class: string; price_cents: number };
    const slug = slugById.get(p.service_id);
    if (!slug || typeof p.price_cents !== 'number') continue;
    const vc = normalizeVehicleClass(p.vehicle_class);
    out[`${slug}:${vc}`] = p.price_cents;
    if (p.vehicle_class === 'suv_truck') {
      out[`${slug}:suv`] = p.price_cents;
      out[`${slug}:truck`] = p.price_cents;
    }
  }
  return out;
}

import { normalizeVehicleClass, type UiVehicleClass } from '@/lib/vehicle-pricing';

type Row = { id: string; vehicle_class: string; price_cents: number; services: unknown };

/** Hide legacy suv/truck rows when suv_truck exists — admin UI shows 2 tiers only. */
export function filterServicePriceRowsForAdminUi(rows: Row[]): Row[] {
  const byService = new Map<string, Map<UiVehicleClass, Row>>();

  for (const row of rows) {
    const svc = Array.isArray(row.services) ? row.services[0] : row.services;
    const slug =
      svc && typeof svc === 'object' && svc !== null && 'slug' in svc
        ? String((svc as { slug?: string }).slug ?? '')
        : '';
    const key = slug || row.id;
    const uiClass = normalizeVehicleClass(row.vehicle_class);
    const bucket = byService.get(key) ?? new Map();
    const existing = bucket.get(uiClass);
    if (!existing || uiClass === 'suv_truck') {
      bucket.set(uiClass, { ...row, vehicle_class: uiClass });
    }
    byService.set(key, bucket);
  }

  const out: Row[] = [];
  for (const classes of byService.values()) {
    for (const r of classes.values()) out.push(r);
  }
  return out.sort((a, b) => a.vehicle_class.localeCompare(b.vehicle_class));
}

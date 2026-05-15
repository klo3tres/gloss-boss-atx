import { normalizeVehicleClass, type UiVehicleClass } from '@/lib/vehicle-pricing';
import {
  CANONICAL_SERVICE_SLUGS,
  CERAMIC_COATING_SLUG,
  isJunkServiceTitle,
  SERVICE_SLUG_ORDER,
} from '@/lib/admin/canonical-services';

type Row = { id: string; vehicle_class: string; price_cents: number; services: unknown };

/** Hide legacy suv/truck rows when suv_truck exists — admin UI shows 2 tiers only. */
export function filterServicePriceRowsForAdminUi(rows: Row[]): Row[] {
  const byService = new Map<string, Map<UiVehicleClass, Row>>();

  for (const row of rows) {
    const svc = Array.isArray(row.services) ? row.services[0] : row.services;
    const slug =
      svc && typeof svc === 'object' && svc !== null && 'slug' in svc
        ? String((svc as { slug?: string }).slug ?? '')
        .trim()
        .toLowerCase()
        : '';
    const title =
      svc && typeof svc === 'object' && svc !== null && 'title' in svc ? String((svc as { title?: string }).title ?? '') : '';

    if (!CANONICAL_SERVICE_SLUGS.has(slug)) continue;
    if (isJunkServiceTitle(title, slug)) continue;
    const isCeramic = slug === CERAMIC_COATING_SLUG;
    if (!isCeramic && row.price_cents <= 0) continue;

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
  return out.sort((a, b) => {
    const slugA = rowSlug(a);
    const slugB = rowSlug(b);
    const ia = SERVICE_SLUG_ORDER.indexOf(slugA as (typeof SERVICE_SLUG_ORDER)[number]);
    const ib = SERVICE_SLUG_ORDER.indexOf(slugB as (typeof SERVICE_SLUG_ORDER)[number]);
    if (ia !== ib) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.vehicle_class.localeCompare(b.vehicle_class);
  });
}

function rowSlug(row: Row): string {
  const svc = Array.isArray(row.services) ? row.services[0] : row.services;
  if (svc && typeof svc === 'object' && svc !== null && 'slug' in svc) {
    return String((svc as { slug?: string }).slug ?? '')
      .trim()
      .toLowerCase();
  }
  return '';
}

/**
 * Canonical vehicle classes: sedan, suv, truck.
 * Legacy DB values (suv_truck) map to suv for UI; truck stays separate.
 */

export const UI_VEHICLE_CLASSES = ['sedan', 'suv', 'truck'] as const;
export type UiVehicleClass = (typeof UI_VEHICLE_CLASSES)[number];

export const UI_VEHICLE_LABELS: Record<UiVehicleClass, string> = {
  sedan: 'Sedan',
  suv: 'SUV',
  truck: 'Truck',
};

/** Normalize stored vehicle_class to sedan | suv | truck. */
export function normalizeVehicleClass(raw: string | null | undefined): UiVehicleClass {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (v === 'sedan') return 'sedan';
  if (v === 'truck') return 'truck';
  if (v === 'suv' || v === 'suv_truck' || v === 'suvtruck') return 'suv';
  if (v === 'van' || v === 'luxury') return 'suv';
  return 'suv';
}

export function uiVehicleLabel(raw: string): string {
  return UI_VEHICLE_LABELS[normalizeVehicleClass(raw)];
}

export type PriceRowLike = { service_id: string; vehicle_class: string; price_cents: number };

function validCents(c: unknown): number | undefined {
  if (typeof c !== 'number' || Number.isNaN(c) || c <= 0) return undefined;
  return Math.round(c);
}

export function pickSedanCents(rows: PriceRowLike[], serviceId: string): number | undefined {
  const direct = rows.find((p) => p.service_id === serviceId && p.vehicle_class === 'sedan');
  return direct ? validCents(direct.price_cents) : undefined;
}

export function pickSuvCents(rows: PriceRowLike[], serviceId: string): number | undefined {
  const order = ['suv', 'suv_truck'] as const;
  for (const cls of order) {
    const row = rows.find((p) => p.service_id === serviceId && p.vehicle_class === cls);
    const c = row ? validCents(row.price_cents) : undefined;
    if (c != null) return c;
  }
  return undefined;
}

export function pickTruckCents(rows: PriceRowLike[], serviceId: string): number | undefined {
  const order = ['truck', 'suv_truck', 'suv'] as const;
  for (const cls of order) {
    const row = rows.find((p) => p.service_id === serviceId && p.vehicle_class === cls);
    const c = row ? validCents(row.price_cents) : undefined;
    if (c != null) return c;
  }
  return undefined;
}

/** @deprecated Use pickSuvCents or pickTruckCents — kept for migrations reading legacy rows. */
export function pickSuvTruckCents(rows: PriceRowLike[], serviceId: string): number | undefined {
  return pickSuvCents(rows, serviceId) ?? pickTruckCents(rows, serviceId);
}

export function pickCentsForUiClass(rows: PriceRowLike[], serviceId: string, uiClass: UiVehicleClass): number | undefined {
  if (uiClass === 'sedan') return pickSedanCents(rows, serviceId);
  if (uiClass === 'truck') return pickTruckCents(rows, serviceId);
  return pickSuvCents(rows, serviceId);
}

/** One row per UI class when a price exists (sedan, suv, truck). */
export function consolidatePriceRowsForUi(rows: PriceRowLike[]): PriceRowLike[] {
  const byService = new Map<string, PriceRowLike[]>();
  for (const r of rows) {
    if (!r?.service_id) continue;
    const c = validCents(r.price_cents);
    if (c == null) continue;
    const list = byService.get(r.service_id) ?? [];
    list.push({ service_id: r.service_id, vehicle_class: r.vehicle_class, price_cents: c });
    byService.set(r.service_id, list);
  }
  const out: PriceRowLike[] = [];
  for (const [serviceId, list] of byService) {
    for (const cls of UI_VEHICLE_CLASSES) {
      const cents = pickCentsForUiClass(list, serviceId, cls);
      if (cents != null) out.push({ service_id: serviceId, vehicle_class: cls, price_cents: cents });
    }
  }
  return out;
}

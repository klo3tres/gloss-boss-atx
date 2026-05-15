/**
 * Canonical UI vehicle classes: Sedan + SUV/Truck only.
 * DB may still store suv, truck, or suv_truck — always normalized here for display/booking.
 */

export const UI_VEHICLE_CLASSES = ['sedan', 'suv_truck'] as const;
export type UiVehicleClass = (typeof UI_VEHICLE_CLASSES)[number];

export const UI_VEHICLE_LABELS: Record<UiVehicleClass, string> = {
  sedan: 'Sedan',
  suv_truck: 'SUV / Truck',
};

/** Map suv, truck, suv_truck → suv_truck; unknown → suv_truck for large-vehicle safety. */
export function normalizeVehicleClass(raw: string | null | undefined): UiVehicleClass {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (v === 'sedan') return 'sedan';
  if (v === 'suv' || v === 'truck' || v === 'suv_truck' || v === 'suvtruck') return 'suv_truck';
  return 'suv_truck';
}

export function uiVehicleLabel(raw: string): string {
  return UI_VEHICLE_LABELS[normalizeVehicleClass(raw)];
}

export type PriceRowLike = { service_id: string; vehicle_class: string; price_cents: number };

function validCents(c: unknown): number | undefined {
  if (typeof c !== 'number' || Number.isNaN(c) || c <= 0) return undefined;
  return Math.round(c);
}

/** Read cents for sedan from price rows. */
export function pickSedanCents(rows: PriceRowLike[], serviceId: string): number | undefined {
  const direct = rows.find((p) => p.service_id === serviceId && p.vehicle_class === 'sedan');
  return direct ? validCents(direct.price_cents) : undefined;
}

/**
 * Large vehicle: suv_truck row, else suv, else truck (never separate UI categories).
 */
export function pickSuvTruckCents(rows: PriceRowLike[], serviceId: string): number | undefined {
  const order = ['suv_truck', 'suv', 'truck'] as const;
  for (const cls of order) {
    const row = rows.find((p) => p.service_id === serviceId && p.vehicle_class === cls);
    const c = row ? validCents(row.price_cents) : undefined;
    if (c != null) return c;
  }
  return undefined;
}

export function pickCentsForUiClass(rows: PriceRowLike[], serviceId: string, uiClass: UiVehicleClass): number | undefined {
  if (uiClass === 'sedan') return pickSedanCents(rows, serviceId);
  return pickSuvTruckCents(rows, serviceId);
}

/** Collapse DB price rows to at most one sedan + one suv_truck per service (no duplicate large-vehicle rows). */
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
    const sedan = pickSedanCents(list, serviceId);
    if (sedan != null) out.push({ service_id: serviceId, vehicle_class: 'sedan', price_cents: sedan });
    const large = pickSuvTruckCents(list, serviceId);
    if (large != null) out.push({ service_id: serviceId, vehicle_class: 'suv_truck', price_cents: large });
  }
  return out;
}

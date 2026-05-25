import { displayMoney } from '@/lib/display-format';
import type { ReceiptBreakdownLine } from '@/lib/receipt-breakdown';
import { vehiclesFromRow, type Row } from '@/lib/work-order-resolve';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function num(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Per-vehicle service + add-on lines for receipts, PDF, and email. */
export function buildPerVehicleReceiptLines(job: Row): ReceiptBreakdownLine[] {
  const vehicles = vehiclesFromRow(job);
  const b = obj(job.booking_pricing_breakdown);
  const addOnLines = Array.isArray(b.addOnLines) ? (b.addOnLines as Record<string, unknown>[]) : [];
  const lines: ReceiptBreakdownLine[] = [];

  vehicles.forEach((v, index) => {
    const desc = str(v.vehicle_description || v.description) || `Vehicle ${index + 1}`;
    const service = str(v.service_slug || job.service_slug).replace(/-/g, ' ');
    const priceCents = num(v.price_cents);
    if (priceCents > 0) {
      lines.push({
        label: `${desc} — ${service}`,
        amount: displayMoney(priceCents),
        tone: 'charge',
      });
    }
    const vehicleAddons = addOnLines.filter((l) => num(l.vehicleIndex ?? l.vehicle_index) === index);
    if (vehicleAddons.length === 0 && index === 0 && addOnLines.length > 0 && !addOnLines.some((l) => l.vehicleIndex != null)) {
      for (const l of addOnLines) {
        lines.push({
          label: `  ${str(l.label || l.slug)}`,
          amount: displayMoney(num(l.priceCents ?? l.price_cents ?? l.cents)),
          tone: 'charge',
        });
      }
      return;
    }
    for (const l of vehicleAddons) {
      lines.push({
        label: `  Add-on: ${str(l.label || l.slug)}`,
        amount: displayMoney(num(l.priceCents ?? l.price_cents ?? l.cents)),
        tone: 'charge',
      });
    }
    const slugs = Array.isArray(v.add_on_slugs) ? (v.add_on_slugs as string[]) : Array.isArray(v.addOnSlugs) ? (v.addOnSlugs as string[]) : [];
    if (vehicleAddons.length === 0 && slugs.length > 0) {
      for (const slug of slugs) {
        lines.push({ label: `  Add-on: ${slug.replace(/-/g, ' ')}`, amount: '—', tone: 'charge' });
      }
    }
  });

  return lines;
}

export function receiptUsesPerVehicleLayout(job: Row): boolean {
  const vehicles = vehiclesFromRow(job);
  if (vehicles.length <= 1) return false;
  const b = obj(job.booking_pricing_breakdown);
  const addOnLines = Array.isArray(b.addOnLines) ? (b.addOnLines as Record<string, unknown>[]) : [];
  return addOnLines.some((l) => num(l.vehicleIndex ?? l.vehicle_index) >= 0) || vehicles.some((v) => Array.isArray(v.add_on_slugs) && v.add_on_slugs.length);
}

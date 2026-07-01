import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { computeAdminJobQuote } from '@/lib/admin/admin-job-quote';
import { normalizeVehicleClass } from '@/lib/vehicle-pricing';

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 });

  const body = (await request.json()) as Record<string, unknown>;
  const addOns = Array.isArray(body.addOnSlugs) ? body.addOnSlugs.map(String) : [];
  const manualType = String(body.manualDiscountType ?? 'none');
  const manualValue = Number(body.manualDiscountValue ?? 0);

  const quote = await computeAdminJobQuote(admin, {
    lines: [
      {
        serviceSlug: String(body.serviceSlug ?? ''),
        vehicleClass: normalizeVehicleClass(String(body.vehicleClass ?? 'sedan')),
        vehicleDescription: String(body.vehicleDescription ?? 'Vehicle'),
        vehicleColor: 'Admin',
        addOnSlugs: addOns,
      },
    ],
    addOns,
    promoCode: String(body.promoCode ?? '').trim() || undefined,
    customerId: String(body.customerId ?? '').trim() || null,
    paymentChoice: body.paymentChoice === 'full' ? 'full' : 'deposit',
    manualDiscount:
      manualType === 'percent' || manualType === 'dollar'
        ? { type: manualType, value: manualValue, reason: String(body.discountReason ?? '') }
        : { type: 'none', value: 0 },
    priceOverrideCents:
      body.priceOverrideCents != null ? Math.round(Number(body.priceOverrideCents)) : null,
  });

  if (!quote.ok) return NextResponse.json({ error: quote.error }, { status: 400 });
  return NextResponse.json(quote);
}

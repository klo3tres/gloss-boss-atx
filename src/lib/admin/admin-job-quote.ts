import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingPricingBreakdown } from '@/lib/booking-pricing';
import { computeQuoteFromInputs, type ResolvedVehicleLine, type VehicleLineInput } from '@/lib/booking-server-shared';
import { normalizeVehicleClass } from '@/lib/vehicle-pricing';
import { displayMoney } from '@/lib/display-format';

export type AdminManualDiscount = {
  type: 'percent' | 'dollar' | 'none';
  value: number;
  reason?: string;
};

export type AdminJobQuoteInput = {
  lines: VehicleLineInput[];
  addOns: string[];
  promoCode?: string;
  customerId?: string | null;
  manualDiscount?: AdminManualDiscount;
  priceOverrideCents?: number | null;
  paymentChoice?: 'deposit' | 'full';
  skipOnlinePromo?: boolean;
};

export type AdminJobQuoteLine = {
  label: string;
  cents: number;
  hint?: string;
};

export type AdminJobQuoteResult = {
  ok: true;
  breakdown: BookingPricingBreakdown & { addOnSlugs?: string[]; manualDiscountCents?: number; manualDiscountReason?: string };
  resolved: ResolvedVehicleLine[];
  lineItems: AdminJobQuoteLine[];
  durationMinutes: number;
  labels: {
    subtotal: string;
    total: string;
    deposit: string;
    balance: string;
  };
};

export async function loadCustomerMembershipDiscountPercent(
  admin: SupabaseClient,
  customerId: string | null | undefined,
): Promise<number> {
  if (!customerId) return 0;
  const { data } = await admin
    .from('customer_memberships')
    .select('status, membership_plan_id, membership_plans(discount_percent)')
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (!data || data.status !== 'active') return 0;
  const plan = data.membership_plans as { discount_percent?: number } | null;
  const pct = Number(plan?.discount_percent ?? 0);
  return Number.isFinite(pct) && pct > 0 ? Math.min(100, pct) : 0;
}

function applyManualDiscount(
  breakdown: BookingPricingBreakdown,
  manual: AdminManualDiscount | undefined,
): { breakdown: BookingPricingBreakdown; manualCents: number } {
  if (!manual || manual.type === 'none' || manual.value <= 0) {
    return { breakdown, manualCents: 0 };
  }
  let manualCents = 0;
  if (manual.type === 'percent') {
    manualCents = Math.round(breakdown.finalTotalCents * (Math.min(100, manual.value) / 100));
  } else {
    manualCents = Math.round(manual.value * 100);
  }
  manualCents = Math.min(breakdown.finalTotalCents, Math.max(0, manualCents));
  const finalTotalCents = Math.max(0, breakdown.finalTotalCents - manualCents);
  const depositCents = Math.min(breakdown.depositCents, finalTotalCents);
  return {
    manualCents,
    breakdown: {
      ...breakdown,
      finalTotalCents,
      depositCents,
    },
  };
}

export async function computeAdminJobQuote(
  admin: SupabaseClient,
  input: AdminJobQuoteInput,
): Promise<{ ok: false; error: string } | AdminJobQuoteResult> {
  const membershipPct = await loadCustomerMembershipDiscountPercent(admin, input.customerId);

  const quote = await computeQuoteFromInputs(admin, {
    lines: input.lines.map((l) => ({
      ...l,
      vehicleClass: normalizeVehicleClass(l.vehicleClass),
      vehicleColor: l.vehicleColor ?? 'Not specified',
    })),
    addOns: input.addOns,
    promoCode: input.promoCode,
    paymentChoice: input.paymentChoice ?? 'deposit',
    allowFreeTestPromo: false,
  });

  if (!quote.ok) return { ok: false, error: quote.error };

  let breakdown = quote.breakdown;

  if (membershipPct > 0) {
    const memberCents = Math.round(breakdown.finalTotalCents * (membershipPct / 100));
    const afterMember = Math.max(0, breakdown.finalTotalCents - memberCents);
    breakdown = {
      ...breakdown,
      membershipDiscountCents: memberCents,
      membershipDiscountPercent: membershipPct,
      finalTotalCents: afterMember,
      depositCents: Math.round(afterMember * ((breakdown.depositPercent ?? 30) / 100)),
    };
  }

  const { breakdown: afterManual, manualCents } = applyManualDiscount(breakdown, input.manualDiscount);

  if (input.priceOverrideCents != null && input.priceOverrideCents >= 0) {
    const override = Math.round(input.priceOverrideCents);
    const depPct = input.paymentChoice === 'full' ? 100 : afterManual.depositPercent ?? 30;
    afterManual.finalTotalCents = override;
    afterManual.depositCents = Math.round(override * (depPct / 100));
  }

  const balanceDue = Math.max(0, afterManual.finalTotalCents - afterManual.depositCents);

  const lineItems: AdminJobQuoteLine[] = [
    { label: 'Base service', cents: afterManual.vehicleSubtotalCents ?? afterManual.afterMultiCarVehicleCents },
  ];
  if ((afterManual.multiCarDiscountCents ?? 0) > 0) {
    lineItems.push({ label: 'Multi-vehicle discount', cents: -(afterManual.multiCarDiscountCents ?? 0) });
  }
  if ((afterManual.addOnSubtotalCents ?? 0) > 0) {
    lineItems.push({ label: 'Add-ons', cents: afterManual.addOnSubtotalCents ?? 0 });
  }
  if ((afterManual.websitePromoDiscountCents ?? 0) > 0) {
    lineItems.push({ label: 'Online promo', cents: -(afterManual.websitePromoDiscountCents ?? 0) });
  }
  if ((afterManual.offerDiscountCents ?? 0) > 0) {
    lineItems.push({ label: 'Offer discount', cents: -(afterManual.offerDiscountCents ?? 0) });
  }
  if ((afterManual.promoDiscountCents ?? 0) > 0) {
    lineItems.push({ label: 'Promo code', cents: -(afterManual.promoDiscountCents ?? 0) });
  }
  if ((afterManual.membershipDiscountCents ?? 0) > 0) {
    lineItems.push({
      label: `Membership (${membershipPct}%)`,
      cents: -(afterManual.membershipDiscountCents ?? 0),
    });
  }
  if (manualCents > 0) {
    lineItems.push({
      label: `Manual discount${input.manualDiscount?.reason ? `: ${input.manualDiscount.reason}` : ''}`,
      cents: -manualCents,
    });
  }
  lineItems.push({ label: 'Total', cents: afterManual.finalTotalCents });

  const durationMinutes = 120;

  return {
    ok: true,
    breakdown: {
      ...afterManual,
      addOnSlugs: input.addOns,
      manualDiscountCents: manualCents,
      manualDiscountReason: input.manualDiscount?.reason,
    },
    resolved: quote.resolved,
    lineItems,
    durationMinutes,
    labels: {
      subtotal: displayMoney(afterManual.prePromoCents ?? afterManual.finalTotalCents),
      total: displayMoney(afterManual.finalTotalCents),
      deposit: displayMoney(afterManual.depositCents),
      balance: displayMoney(balanceDue),
    },
  };
}

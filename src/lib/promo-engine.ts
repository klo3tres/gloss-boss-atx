import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingPricingBreakdown } from '@/lib/booking-pricing';
import { normalizeVehicleClass } from '@/lib/vehicle-pricing';

export type PromoAppliesTo = 'base_services' | 'addons' | 'specific_addon' | 'order';
export type PromoPaymentMode = 'any' | 'deposit' | 'full';

export type PromoRules = {
  appliesTo?: PromoAppliesTo;
  addonSlug?: string;
  vehicleClasses?: string[];
  services?: string[];
  paymentMode?: PromoPaymentMode;
  stackable?: boolean;
};

export type PromoRow = {
  id: string;
  code: string;
  enabled: boolean;
  discount_type: string;
  discount_value: number;
  service_restrictions: unknown;
  rules: PromoRules;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  current_uses: number;
  archived: boolean;
};

export type PromoValidationInput = {
  code: string;
  paymentChoice?: 'deposit' | 'full';
  vehicleLines: Array<{ serviceSlug: string; vehicleClass: string }>;
  vehicleLineCents?: number[];
  baseEligibleCents?: number;
  addOnSubtotalCents?: number;
  orderCents?: number;
  addOnSlugs: string[];
  addOnCentsBySlug: Record<string, number>;
  allowFreeTestPromo?: boolean;
};

export type PromoValidationResult =
  | { ok: false; error: string }
  | {
      ok: true;
      code: string;
      comped: boolean;
      testOneDollar: boolean;
      promoDiscountCents: number;
      rules: PromoRules;
      message: string;
    };

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => str(x).toLowerCase()).filter(Boolean);
  if (typeof v === 'string' && v.startsWith('[')) {
    try {
      const p = JSON.parse(v) as unknown;
      if (Array.isArray(p)) return p.map((x) => str(x).toLowerCase()).filter(Boolean);
    } catch {
      return v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    }
  }
  return v ? [str(v).toLowerCase()] : [];
}

function parseRules(row: Record<string, unknown>): PromoRules {
  const rulesRaw = row.rules;
  const base: PromoRules = {};
  if (rulesRaw && typeof rulesRaw === 'object' && !Array.isArray(rulesRaw)) {
    const r = rulesRaw as Record<string, unknown>;
    if (r.appliesTo) base.appliesTo = str(r.appliesTo) as PromoAppliesTo;
    if (r.addonSlug) base.addonSlug = str(r.addonSlug).toLowerCase();
    if (Array.isArray(r.vehicleClasses)) base.vehicleClasses = arr(r.vehicleClasses);
    if (Array.isArray(r.services)) base.services = arr(r.services);
    if (r.paymentMode) base.paymentMode = str(r.paymentMode) as PromoPaymentMode;
    if (typeof r.stackable === 'boolean') base.stackable = r.stackable;
  }
  const legacyServices = arr(row.service_restrictions);
  if (!base.services?.length && legacyServices.length) base.services = legacyServices;
  if (!base.appliesTo) {
    if (str(row.discount_type) === 'comp') base.appliesTo = 'order';
    else if (base.addonSlug) base.appliesTo = 'specific_addon';
    else if (legacyServices.length) base.appliesTo = 'base_services';
    else base.appliesTo = 'base_services';
  }
  if (base.paymentMode == null) base.paymentMode = 'any';
  if (base.stackable == null) base.stackable = false;
  return base;
}

export async function loadPromoByCode(admin: SupabaseClient, code: string): Promise<PromoRow | null> {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  const { data, error } = await admin.from('promo_codes').select('*').eq('code', c).maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: str(row.id),
    code: str(row.code),
    enabled: row.enabled !== false,
    discount_type: str(row.discount_type) || 'fixed',
    discount_value: Number(row.discount_value) || 0,
    service_restrictions: row.service_restrictions,
    rules: parseRules(row),
    starts_at: row.starts_at ? str(row.starts_at) : null,
    ends_at: row.ends_at ? str(row.ends_at) : null,
    max_uses: typeof row.max_uses === 'number' ? row.max_uses : null,
    current_uses: Number(row.current_uses) || 0,
    archived: Boolean(row.archived),
  };
}

export function validatePromoRow(promo: PromoRow, input: PromoValidationInput): PromoValidationResult {
  const code = promo.code;
  if (promo.archived || !promo.enabled) {
    return { ok: false, error: 'This promo code is not active.' };
  }
  const now = Date.now();
  if (promo.starts_at && Date.parse(promo.starts_at) > now) {
    return { ok: false, error: 'This promo code is not active yet.' };
  }
  if (promo.ends_at && Date.parse(promo.ends_at) < now) {
    return { ok: false, error: 'This promo code has expired.' };
  }
  if (promo.max_uses != null && promo.current_uses >= promo.max_uses) {
    return { ok: false, error: 'This promo code has reached its use limit.' };
  }

  const rules = promo.rules;
  if (rules.paymentMode && rules.paymentMode !== 'any' && input.paymentChoice && rules.paymentMode !== input.paymentChoice) {
    return { ok: false, error: `This code only applies to ${rules.paymentMode === 'full' ? 'pay in full' : 'deposit'} bookings.` };
  }

  if (rules.vehicleClasses?.length) {
    const bad = input.vehicleLines.some((l) => !rules.vehicleClasses!.includes(normalizeVehicleClass(l.vehicleClass)));
    if (bad) return { ok: false, error: `Code limited to: ${rules.vehicleClasses.join(', ')}.` };
  }

  if (rules.services?.length) {
    const bad = input.vehicleLines.some((l) => !rules.services!.includes(str(l.serviceSlug).toLowerCase()));
    if (bad) return { ok: false, error: `Code limited to services: ${rules.services.join(', ')}.` };
  }

  if (code === 'FREE') {
    if (!input.allowFreeTestPromo) return { ok: false, error: 'FREE promo is disabled. Enable in Admin → Promotions.' };
    if (input.vehicleLines.length !== 1) return { ok: false, error: 'FREE applies to one sedan exterior wash only.' };
    const line = input.vehicleLines[0]!;
    if (line.serviceSlug !== 'exterior-wash' || normalizeVehicleClass(line.vehicleClass) !== 'sedan') {
      return { ok: false, error: 'FREE applies to sedan exterior wash only.' };
    }
    return { ok: true, code, comped: true, testOneDollar: false, promoDiscountCents: 0, rules, message: 'FREE promo applied — $0 total.' };
  }

  if (code === 'TEST1') {
    return {
      ok: true,
      code,
      comped: false,
      testOneDollar: true,
      promoDiscountCents: 0,
      rules,
      message: 'TEST1 — $1.00 test checkout (pay in full).',
    };
  }

  if (promo.discount_type === 'comp') {
    return { ok: true, code, comped: true, testOneDollar: false, promoDiscountCents: 0, rules, message: `${code} comp applied.` };
  }

  const discountBase = computePromoDiscountBase(promo, rules, input);
  if (discountBase <= 0) {
    return { ok: false, error: 'This promo does not apply to your cart.' };
  }

  let promoDiscountCents = 0;
  if (promo.discount_type === 'percent') {
    promoDiscountCents = Math.round(discountBase * (promo.discount_value / 100));
  } else {
    promoDiscountCents = Math.min(discountBase, Math.round(promo.discount_value * 100));
  }

  return {
    ok: true,
    code,
    comped: false,
    testOneDollar: false,
    promoDiscountCents,
    rules,
    message: `${code} applied — saves $${(promoDiscountCents / 100).toFixed(2)}.`,
  };
}

function computePromoDiscountBase(promo: PromoRow, rules: PromoRules, input: PromoValidationInput): number {
  const appliesTo = rules.appliesTo ?? 'base_services';
  if (appliesTo === 'specific_addon') {
    const slug = str(rules.addonSlug).toLowerCase();
    if (!slug) return 0;
    const match = input.addOnSlugs.find((s) => s.toLowerCase() === slug || s.toLowerCase().includes(slug));
    if (!match) return 0;
    return input.addOnCentsBySlug[match] ?? input.addOnCentsBySlug[slug] ?? 0;
  }
  if (appliesTo === 'addons') {
    return input.addOnSubtotalCents ?? Object.values(input.addOnCentsBySlug).reduce((s, n) => s + n, 0);
  }
  if (appliesTo === 'order') {
    return input.orderCents ?? 0;
  }
  if (input.baseEligibleCents != null && input.baseEligibleCents > 0) return input.baseEligibleCents;
  if (input.vehicleLineCents?.length) return input.vehicleLineCents.reduce((s, n) => s + n, 0);
  return 0;
}

/** Apply validated promo onto pricing breakdown (does not discount add-ons unless scoped). */
export function applyPromoToBreakdown(
  bd: BookingPricingBreakdown,
  promo: PromoValidationResult & { ok: true },
): BookingPricingBreakdown {
  if (!promo.ok) return bd;
  if (promo.comped) {
    return {
      ...bd,
      promoDiscountCents: bd.prePromoCents,
      offerDiscountCents: bd.offerDiscountCents,
      finalTotalCents: 0,
      depositCents: 0,
    };
  }
  if (promo.testOneDollar) {
    const finalTotalCents = 100;
    return {
      ...bd,
      promoDiscountCents: Math.max(0, bd.finalTotalCents - finalTotalCents),
      finalTotalCents,
      depositCents: finalTotalCents,
      depositPercent: 100,
    };
  }

  let promoDiscountCents = promo.promoDiscountCents;
  if (promo.rules.appliesTo === 'base_services' || !promo.rules.appliesTo) {
    const baseEligible = Math.max(0, bd.afterMultiCarVehicleCents - bd.offerDiscountCents - bd.websitePromoDiscountCents);
    promoDiscountCents = Math.min(promoDiscountCents, baseEligible);
  }

  const finalTotalCents = Math.max(0, bd.finalTotalCents - promoDiscountCents);
  const depositCents = Math.round((finalTotalCents * bd.depositPercent) / 100);
  return {
    ...bd,
    promoDiscountCents,
    finalTotalCents,
    depositCents,
  };
}

export async function incrementPromoUse(admin: SupabaseClient, code: string): Promise<void> {
  const promo = await loadPromoByCode(admin, code);
  if (!promo) return;
  await admin
    .from('promo_codes')
    .update({ current_uses: promo.current_uses + 1, updated_at: new Date().toISOString() })
    .eq('code', promo.code);
}

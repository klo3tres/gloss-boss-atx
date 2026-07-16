import type { SupabaseClient } from '@supabase/supabase-js';

export type DiscountPolicyConfig = {
  allowRewardPlusPromo: boolean;
  allowMembershipPlusPromo: boolean;
  allowReferralPlusPromo: boolean;
  allowLoyaltyPlusPromo: boolean;
  maximumCombinedDiscountPercent: number;
  maximumCombinedDiscountCents: number | null;
  minimumOrderTotalCents: number;
  excludedServiceSlugs: string[];
  excludedPromoCodes: string[];
  oneRewardPerOrder: boolean;
  onePromoCodePerOrder: boolean;
  qaMode: {
    enabled: boolean;
    expiresAt: string | null;
    approvedCustomerIds: string[];
    approvedCustomerEmails: string[];
    allowStacking: boolean;
  };
};

export type DiscountPolicyInput = {
  originalTotalCents: number;
  totalAfterPromotionalDiscountsCents: number;
  requestedCreditCents?: number;
  serviceSlugs: string[];
  promoCodes: string[];
  hasOfferOrSitePromo?: boolean;
  hasMembershipDiscount?: boolean;
  hasReferralDiscount?: boolean;
  hasReward?: boolean;
  rewardKind?: 'referral' | 'loyalty' | 'other';
  customerId?: string | null;
  customerEmail?: string | null;
};

export type DiscountPolicyDecision = {
  ok: boolean;
  error?: string;
  isQaTest: boolean;
  qaReason: string | null;
  allowedCreditCents: number;
  combinedDiscountCents: number;
  finalTotalCents: number;
  activeMechanisms: string[];
};

export const DEFAULT_DISCOUNT_POLICY: DiscountPolicyConfig = {
  allowRewardPlusPromo: false,
  allowMembershipPlusPromo: false,
  allowReferralPlusPromo: false,
  allowLoyaltyPlusPromo: false,
  maximumCombinedDiscountPercent: 100,
  maximumCombinedDiscountCents: null,
  minimumOrderTotalCents: 0,
  excludedServiceSlugs: [],
  excludedPromoCodes: [],
  oneRewardPerOrder: true,
  onePromoCodePerOrder: true,
  qaMode: {
    enabled: false,
    expiresAt: null,
    approvedCustomerIds: [],
    approvedCustomerEmails: [],
    allowStacking: true,
  },
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function list(value: unknown, upper = false): string[] {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(source.map((item) => String(item).trim()).filter(Boolean).map((item) => upper ? item.toUpperCase() : item.toLowerCase()))];
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function cents(value: unknown, fallback: number | null): number | null {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

export function parseDiscountPolicy(value: unknown): DiscountPolicyConfig {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = {}; }
  }
  const root = object(raw);
  const qa = object(root.qaMode ?? root.qa_mode);
  const pct = Number(root.maximumCombinedDiscountPercent ?? root.maximum_combined_discount_percent);
  return {
    allowRewardPlusPromo: bool(root.allowRewardPlusPromo ?? root.allow_reward_plus_promo, false),
    allowMembershipPlusPromo: bool(root.allowMembershipPlusPromo ?? root.allow_membership_plus_promo, false),
    allowReferralPlusPromo: bool(root.allowReferralPlusPromo ?? root.allow_referral_plus_promo, false),
    allowLoyaltyPlusPromo: bool(root.allowLoyaltyPlusPromo ?? root.allow_loyalty_plus_promo, false),
    maximumCombinedDiscountPercent: Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 100,
    maximumCombinedDiscountCents: cents(root.maximumCombinedDiscountCents ?? root.maximum_combined_discount_cents, null),
    minimumOrderTotalCents: cents(root.minimumOrderTotalCents ?? root.minimum_order_total_cents, 0) ?? 0,
    excludedServiceSlugs: list(root.excludedServiceSlugs ?? root.excluded_service_slugs),
    excludedPromoCodes: list(root.excludedPromoCodes ?? root.excluded_promo_codes, true),
    oneRewardPerOrder: bool(root.oneRewardPerOrder ?? root.one_reward_per_order, true),
    onePromoCodePerOrder: bool(root.onePromoCodePerOrder ?? root.one_promo_code_per_order, true),
    qaMode: {
      enabled: bool(qa.enabled, false),
      expiresAt: typeof (qa.expiresAt ?? qa.expires_at) === 'string' ? String(qa.expiresAt ?? qa.expires_at) : null,
      approvedCustomerIds: list(qa.approvedCustomerIds ?? qa.approved_customer_ids),
      approvedCustomerEmails: list(qa.approvedCustomerEmails ?? qa.approved_customer_emails),
      allowStacking: bool(qa.allowStacking ?? qa.allow_stacking, true),
    },
  };
}

export async function loadDiscountPolicy(admin: SupabaseClient): Promise<DiscountPolicyConfig> {
  const { data, error } = await admin.from('site_settings').select('value').eq('key', 'discount_policy').maybeSingle();
  if (error || !data?.value) return DEFAULT_DISCOUNT_POLICY;
  return parseDiscountPolicy(data.value);
}

export function qaModeForCustomer(
  policy: DiscountPolicyConfig,
  customer: { id?: string | null; email?: string | null },
): { active: boolean; reason: string | null } {
  if (!policy.qaMode.enabled) return { active: false, reason: null };
  if (policy.qaMode.expiresAt) {
    const expiry = Date.parse(policy.qaMode.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return { active: false, reason: 'QA mode expired' };
  }
  const id = String(customer.id ?? '').trim().toLowerCase();
  const email = String(customer.email ?? '').trim().toLowerCase();
  const approved =
    (id && policy.qaMode.approvedCustomerIds.includes(id)) ||
    (email && policy.qaMode.approvedCustomerEmails.includes(email));
  return approved
    ? { active: true, reason: email ? `Approved QA customer: ${email}` : 'Approved QA customer' }
    : { active: false, reason: null };
}

export function evaluateDiscountPolicy(policy: DiscountPolicyConfig, input: DiscountPolicyInput): DiscountPolicyDecision {
  const original = Math.max(0, Math.round(input.originalTotalCents));
  const afterPromos = Math.min(original, Math.max(0, Math.round(input.totalAfterPromotionalDiscountsCents)));
  const promoCodes = list(input.promoCodes, true);
  const services = list(input.serviceSlugs);
  const qa = qaModeForCustomer(policy, { id: input.customerId, email: input.customerEmail });
  const stackingOverride = qa.active && policy.qaMode.allowStacking;
  const hasPromo = promoCodes.length > 0 || input.hasOfferOrSitePromo === true;
  const activeMechanisms = [
    hasPromo ? 'promotion' : null,
    input.hasMembershipDiscount ? 'membership' : null,
    input.hasReferralDiscount ? 'referral' : null,
    input.hasReward ? (input.rewardKind === 'loyalty' ? 'loyalty reward' : 'reward') : null,
  ].filter((item): item is string => Boolean(item));

  const fail = (error: string): DiscountPolicyDecision => ({
    ok: false,
    error,
    isQaTest: qa.active,
    qaReason: qa.reason,
    allowedCreditCents: 0,
    combinedDiscountCents: Math.max(0, original - afterPromos),
    finalTotalCents: afterPromos,
    activeMechanisms,
  });

  if (policy.onePromoCodePerOrder && promoCodes.length > 1) return fail('Only one promo code can be used per order.');
  if (promoCodes.some((code) => policy.excludedPromoCodes.includes(code))) return fail('That promotion is excluded by the active discount policy.');
  if (hasPromo && services.some((slug) => policy.excludedServiceSlugs.includes(slug))) {
    return fail('Promotions are not available for one of the selected services.');
  }

  if (!stackingOverride) {
    if (hasPromo && input.hasMembershipDiscount && !policy.allowMembershipPlusPromo) {
      return fail('Membership pricing cannot be combined with this promotion.');
    }
    if (hasPromo && input.hasReferralDiscount && !policy.allowReferralPlusPromo) {
      return fail('Choose either the promo code or the referral discount for this order.');
    }
    if (hasPromo && input.hasReward) {
      const allowed = input.rewardKind === 'loyalty' ? policy.allowLoyaltyPlusPromo : policy.allowRewardPlusPromo;
      if (!allowed) return fail('Choose either the promotion or the customer reward for this order.');
    }
    if (policy.oneRewardPerOrder && input.hasReferralDiscount && input.hasReward) {
      return fail('Only one referral or loyalty reward can be used per order.');
    }
  }

  const combinedBeforeCredits = Math.max(0, original - afterPromos);
  const maxByPercent = Math.round(original * (policy.maximumCombinedDiscountPercent / 100));
  const maxCombined = policy.maximumCombinedDiscountCents == null
    ? maxByPercent
    : Math.min(maxByPercent, policy.maximumCombinedDiscountCents);
  if (!stackingOverride && combinedBeforeCredits > maxCombined) {
    return fail('The combined discount exceeds the configured order limit.');
  }

  const requestedCredit = Math.max(0, Math.round(input.requestedCreditCents ?? 0));
  const maxCreditByMinimum = Math.max(0, afterPromos - policy.minimumOrderTotalCents);
  const maxCreditByCombined = Math.max(0, maxCombined - combinedBeforeCredits);
  const allowedCreditCents = Math.min(requestedCredit, maxCreditByMinimum, stackingOverride ? requestedCredit : maxCreditByCombined);
  if (requestedCredit > allowedCreditCents) {
    return fail(`Customer credits cannot reduce this order below $${(policy.minimumOrderTotalCents / 100).toFixed(2)} or exceed the combined discount limit.`);
  }

  return {
    ok: true,
    isQaTest: qa.active,
    qaReason: qa.reason,
    allowedCreditCents,
    combinedDiscountCents: combinedBeforeCredits + allowedCreditCents,
    finalTotalCents: Math.max(0, afterPromos - allowedCreditCents),
    activeMechanisms,
  };
}

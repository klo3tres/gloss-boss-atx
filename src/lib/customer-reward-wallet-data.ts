import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomerRewardWalletItem } from '@/components/customer/customer-reward-wallet';
import { formatRewardSummary } from '@/lib/referral/referral-codes';

export type CustomerRewardWalletData = {
  items: CustomerRewardWalletItem[];
  availableCreditCents: number;
};

export async function loadCustomerRewardWallet(
  admin: SupabaseClient,
  customerId: string,
): Promise<CustomerRewardWalletData> {
  const [creditRes, referralRes] = await Promise.all([
    admin
      .from('customer_credits')
      .select('id, amount_cents, remaining_cents, type, reason, source, status, expires_at, redeemed_at')
      .eq('customer_id', customerId)
      .order('issued_at', { ascending: false })
      .limit(500),
    admin
      .from('referral_rewards')
      .select(
        'id, customer_credit_id, reward_type, reward_value, reward_label, status, expires_at, metadata, eligibility, selected_service_slug, selected_addon_slug, reserved_appointment_id, created_at',
      )
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);
  if (creditRes.error) throw new Error(creditRes.error.message);
  if (referralRes.error) throw new Error(referralRes.error.message);

  const nowIso = new Date().toISOString();
  const creditIds = new Set((creditRes.data ?? []).map((row) => String(row.id)));
  let availableCreditCents = 0;
  const creditItems: CustomerRewardWalletItem[] = (creditRes.data ?? []).map((row) => {
    const rawStatus = String(row.status ?? 'active').toLowerCase();
    const expired = Boolean(row.expires_at && String(row.expires_at) < nowIso);
    const remainingCents = Math.max(0, Number(row.remaining_cents ?? row.amount_cents ?? 0));
    const usable = ['active', 'partially_used'].includes(rawStatus) && !expired && remainingCents > 0;
    if (usable) availableCreditCents += remainingCents;
    return {
      id: `credit:${row.id}`,
      source: String(row.type ?? row.source ?? 'Account credit').replace(/_/g, ' '),
      title: String(row.reason ?? 'Gloss Boss credit'),
      valueLabel: `$${(remainingCents / 100).toFixed(2)}`,
      status: expired ? 'expired' : rawStatus,
      expiresAt: row.expires_at ? String(row.expires_at) : null,
      usable,
      terms: usable
        ? 'Choose how much credit to apply during booking. One-time balance; any remainder stays in your wallet.'
        : null,
    };
  });

  const referralItems: CustomerRewardWalletItem[] = (referralRes.data ?? [])
    .filter((row) => !row.customer_credit_id || !creditIds.has(String(row.customer_credit_id)))
    .map((row) => {
      const metadata =
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : {};
      const eligibility =
        row.eligibility && typeof row.eligibility === 'object'
          ? (row.eligibility as Record<string, unknown>)
          : {};
      const expiresAt =
        row.expires_at
          ? String(row.expires_at)
          : typeof metadata.expires_at === 'string'
            ? metadata.expires_at
            : null;
      const expired = Boolean(expiresAt && expiresAt < nowIso);
      const status = expired ? 'expired' : String(row.status ?? 'pending').toLowerCase();
      const rewardType = String(row.reward_type ?? 'custom');
      const rewardValue = Number(row.reward_value ?? 0);
      const serviceTerms = Array.isArray(eligibility.eligibleServiceSlugs)
        ? eligibility.eligibleServiceSlugs.map(String)
        : [];
      const addonTerms = Array.isArray(eligibility.eligibleAddonSlugs)
        ? eligibility.eligibleAddonSlugs.map(String)
        : [];
      const vehicleTerms = Array.isArray(eligibility.vehicleRestrictions)
        ? eligibility.vehicleRestrictions.map(String)
        : [];
      const terms = [
        serviceTerms.length ? `Services: ${serviceTerms.join(', ')}` : '',
        addonTerms.length ? `Add-ons: ${addonTerms.join(', ')}` : '',
        vehicleTerms.length ? `Vehicles: ${vehicleTerms.join(', ')}` : '',
        eligibility.maximumRetailCents
          ? `Maximum value: $${(Number(eligibility.maximumRetailCents) / 100).toFixed(2)}`
          : '',
        eligibility.customerPaysDifference === true ? 'You pay any difference.' : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const valueLabel = formatRewardSummary(rewardType, rewardValue);
      return {
        id: `referral:${row.id}`,
        source: rewardType === 'membership_credit' ? 'Membership reward' : 'Referral reward',
        title: String(row.reward_label ?? valueLabel),
        valueLabel,
        status,
        expiresAt,
        usable: ['issued', 'available'].includes(status),
        terms: `${terms ? `${terms} ` : ''}Selection is confirmed during booking. One-time use.`,
        bookingHref: `/book?reward=${encodeURIComponent(String(row.id))}`,
      };
    });

  return { items: [...creditItems, ...referralItems], availableCreditCents };
}

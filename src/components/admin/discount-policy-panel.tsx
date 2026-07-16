'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck, TestTube2 } from 'lucide-react';
import { updateDiscountPolicyAction } from '@/app/(dashboard)/admin/settings/actions';
import { evaluateDiscountPolicy, type DiscountPolicyConfig } from '@/lib/discount-policy';

const inputClass = 'mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-gold/50';

function Toggle({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-xs text-zinc-300">
      <input name={name} type="checkbox" defaultChecked={checked} className="h-4 w-4 accent-amber-400" />
      {label}
    </label>
  );
}

function dateTimeLocal(value: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

export function DiscountPolicyPanel({ policy, canEdit }: { policy: DiscountPolicyConfig; canEdit: boolean }) {
  const [sim, setSim] = useState({
    total: 200,
    promoDiscount: 20,
    promo: true,
    membership: false,
    referral: false,
    reward: false,
    loyalty: false,
    credits: 0,
  });
  const decision = useMemo(() => evaluateDiscountPolicy(policy, {
    originalTotalCents: Math.round(sim.total * 100),
    totalAfterPromotionalDiscountsCents: Math.max(0, Math.round((sim.total - sim.promoDiscount) * 100)),
    requestedCreditCents: Math.round(sim.credits * 100),
    serviceSlugs: ['simulated-service'],
    promoCodes: sim.promo ? ['SIMULATOR'] : [],
    hasMembershipDiscount: sim.membership,
    hasReferralDiscount: sim.referral,
    hasReward: sim.reward || sim.loyalty,
    rewardKind: sim.loyalty ? 'loyalty' : 'referral',
  }), [policy, sim]);

  return (
    <section className="space-y-5 rounded-2xl border border-gold/20 bg-black/35 p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-gold-soft" />
        <div>
          <h2 className="text-base font-black text-white">Discount policy</h2>
          <p className="mt-1 text-xs text-zinc-500">Server-enforced rules for promos, referrals, loyalty, membership pricing, and customer credits.</p>
        </div>
      </div>

      <form action={updateDiscountPolicyAction} className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle name="allowRewardPlusPromo" label="Allow customer reward + promo" checked={policy.allowRewardPlusPromo} />
          <Toggle name="allowMembershipPlusPromo" label="Allow membership pricing + promo" checked={policy.allowMembershipPlusPromo} />
          <Toggle name="allowReferralPlusPromo" label="Allow referral discount + promo" checked={policy.allowReferralPlusPromo} />
          <Toggle name="allowLoyaltyPlusPromo" label="Allow loyalty reward + promo" checked={policy.allowLoyaltyPlusPromo} />
          <Toggle name="oneRewardPerOrder" label="Limit to one reward per order" checked={policy.oneRewardPerOrder} />
          <Toggle name="onePromoCodePerOrder" label="Limit to one promo code per order" checked={policy.onePromoCodePerOrder} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-zinc-400">Maximum combined discount (%)
            <input className={inputClass} name="maximumCombinedDiscountPercent" type="number" min="0" max="100" step="1" defaultValue={policy.maximumCombinedDiscountPercent} />
          </label>
          <label className="text-xs text-zinc-400">Maximum combined discount ($)
            <input className={inputClass} name="maximumCombinedDiscountDollars" type="number" min="0" step="0.01" defaultValue={policy.maximumCombinedDiscountCents == null ? '' : (policy.maximumCombinedDiscountCents / 100).toFixed(2)} placeholder="No dollar cap" />
          </label>
          <label className="text-xs text-zinc-400">Minimum order after credits ($)
            <input className={inputClass} name="minimumOrderTotalDollars" type="number" min="0" step="0.01" defaultValue={(policy.minimumOrderTotalCents / 100).toFixed(2)} />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-400">Services excluded from promotions
            <input className={inputClass} name="excludedServiceSlugs" defaultValue={policy.excludedServiceSlugs.join(', ')} placeholder="ceramic-coating, fleet" />
          </label>
          <label className="text-xs text-zinc-400">Promotion codes excluded by policy
            <input className={inputClass} name="excludedPromoCodes" defaultValue={policy.excludedPromoCodes.join(', ')} placeholder="VIP, PARTNER" />
          </label>
        </div>

        <div className="space-y-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-cyan-100"><TestTube2 className="h-4 w-4" /> QA test mode</div>
          <p className="text-xs text-zinc-400">Only approved customers are marked as test records and may use temporary stacking. The mode turns off automatically at expiration.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle name="qaEnabled" label="Enable QA mode" checked={policy.qaMode.enabled} />
            <Toggle name="qaAllowStacking" label="Allow stacking for approved testers" checked={policy.qaMode.allowStacking} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-zinc-400">Approved customer emails
              <input className={inputClass} name="qaApprovedCustomerEmails" defaultValue={policy.qaMode.approvedCustomerEmails.join(', ')} placeholder="test@example.com" />
            </label>
            <label className="text-xs text-zinc-400">Approved customer IDs
              <input className={inputClass} name="qaApprovedCustomerIds" defaultValue={policy.qaMode.approvedCustomerIds.join(', ')} placeholder="Customer UUID" />
            </label>
            <label className="text-xs text-zinc-400">Automatic expiration
              <input className={inputClass} name="qaExpiresAt" type="datetime-local" defaultValue={dateTimeLocal(policy.qaMode.expiresAt)} />
            </label>
          </div>
        </div>

        <button disabled={!canEdit} className="rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black disabled:cursor-not-allowed disabled:opacity-40">
          {canEdit ? 'Save discount policy' : 'Super admin required'}
        </button>
      </form>

      <div className="space-y-4 border-t border-white/10 pt-5">
        <div>
          <h3 className="text-sm font-black text-white">Policy simulator</h3>
          <p className="mt-1 text-xs text-zinc-500">Preview the saved rules without creating a booking or changing revenue.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ['Order total', 'total'],
            ['Promo discount', 'promoDiscount'],
            ['Customer credits', 'credits'],
          ].map(([label, key]) => (
            <label key={key} className="text-xs text-zinc-400">{label} ($)
              <input className={inputClass} type="number" min="0" step="0.01" value={sim[key as 'total' | 'promoDiscount' | 'credits']} onChange={(event) => setSim((old) => ({ ...old, [key]: Number(event.target.value) || 0 }))} />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ['promo', 'Promo code'],
            ['membership', 'Membership'],
            ['referral', 'Referral discount'],
            ['reward', 'Referral reward'],
            ['loyalty', 'Loyalty reward'],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setSim((old) => ({ ...old, [key]: !old[key] }))} className={`rounded-xl border px-3 py-2 text-xs font-bold ${sim[key] ? 'border-gold/50 bg-gold/15 text-gold-soft' : 'border-white/10 text-zinc-500'}`}>{label}</button>
          ))}
        </div>
        <div className={`rounded-xl border p-4 ${decision.ok ? 'border-emerald-400/25 bg-emerald-400/5' : 'border-red-400/25 bg-red-400/5'}`}>
          <p className={`text-sm font-black ${decision.ok ? 'text-emerald-200' : 'text-red-200'}`}>{decision.ok ? 'Allowed by saved policy' : 'Blocked by saved policy'}</p>
          <p className="mt-1 text-xs text-zinc-400">{decision.error ?? `Projected total: $${(decision.finalTotalCents / 100).toFixed(2)} · Combined discount: $${(decision.combinedDiscountCents / 100).toFixed(2)}`}</p>
        </div>
      </div>
    </section>
  );
}

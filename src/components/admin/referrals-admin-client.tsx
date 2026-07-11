'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ReferralProgramSettings, ReferralRewardLadderTier } from '@/lib/referral/referral-codes';
import { formatRewardSummary } from '@/lib/referral/referral-codes';
import { analyzeReferralEconomics } from '@/lib/referral/referral-economics';
import { saveReferralProgramSettingsAction, type ReferralSaveResult } from '@/app/(dashboard)/admin/referrals/actions';
import { attachReferralToBookingAction } from '@/app/(dashboard)/admin/notifications/cadence-actions';

const inputClass = 'mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-foreground';

function RewardLadderEditor({ initial }: { initial: ReferralRewardLadderTier[] }) {
  const [tiers, setTiers] = useState<ReferralRewardLadderTier[]>(
    initial.length > 0 ? initial : [{ threshold: 1, rewardType: 'percent', rewardValue: 15, label: '15% off next detail' }],
  );

  const moveTier = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= tiers.length) return;
    const next = [...tiers];
    const tmp = next[idx];
    next[idx] = next[nextIdx];
    next[nextIdx] = tmp;
    setTiers(next);
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name="reward_ladder_json" value={JSON.stringify(tiers)} />
      <p className="text-xs text-muted-foreground">Reward ladder — unlocks as referrals complete. Defaults include 15% and are fully editable.</p>
      {tiers.map((tier, idx) => (
        <div key={idx} className="grid gap-2 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
          <label className="text-[10px] font-black uppercase text-muted-foreground">
            At N referrals
            <input
              type="number"
              min={1}
              value={tier.threshold}
              onChange={(e) => {
                const next = [...tiers];
                next[idx] = { ...tier, threshold: Number(e.target.value) || 1 };
                setTiers(next);
              }}
              className={inputClass}
            />
          </label>
          <label className="text-[10px] font-black uppercase text-muted-foreground">
            Type
            <select
              value={tier.rewardType}
              onChange={(e) => {
                const next = [...tiers];
                next[idx] = { ...tier, rewardType: e.target.value as ReferralRewardLadderTier['rewardType'] };
                setTiers(next);
              }}
              className={inputClass}
            >
              <option value="percent">Percent off</option>
              <option value="dollar">Dollar off</option>
              <option value="free_service">Free service</option>
              <option value="custom">Custom label</option>
            </select>
          </label>
          <label className="text-[10px] font-black uppercase text-muted-foreground">
            Value
            <input
              type="number"
              value={tier.rewardValue}
              onChange={(e) => {
                const next = [...tiers];
                next[idx] = { ...tier, rewardValue: Number(e.target.value) || 0 };
                setTiers(next);
              }}
              className={inputClass}
            />
          </label>
          <label className="text-[10px] font-black uppercase text-muted-foreground">
            Customer-facing label
            <input
              value={tier.label}
              onChange={(e) => {
                const next = [...tiers];
                next[idx] = { ...tier, label: e.target.value };
                setTiers(next);
              }}
              placeholder={formatRewardSummary(tier.rewardType, tier.rewardValue)}
              className={inputClass}
            />
          </label>
          <div className="flex items-end gap-1 pb-1">
            <button
              type="button"
              onClick={() => moveTier(idx, -1)}
              disabled={idx === 0}
              className="rounded-xl border border-border px-2 py-2 text-[10px] font-black uppercase text-muted-foreground disabled:opacity-30"
              aria-label="Move tier up"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveTier(idx, 1)}
              disabled={idx === tiers.length - 1}
              className="rounded-xl border border-border px-2 py-2 text-[10px] font-black uppercase text-muted-foreground disabled:opacity-30"
              aria-label="Move tier down"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => setTiers(tiers.filter((_, i) => i !== idx))}
              className="rounded-xl border border-border px-2 py-2 text-[10px] font-black uppercase text-muted-foreground"
              aria-label="Remove tier"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setTiers([
            ...tiers,
            {
              threshold: (tiers[tiers.length - 1]?.threshold ?? 0) + 1,
              rewardType: 'percent',
              rewardValue: 10,
              label: '10% off next detail',
            },
          ])
        }
        className="rounded-xl border border-border px-3 py-2 text-[10px] font-black uppercase text-foreground"
      >
        Add ladder tier
      </button>
    </div>
  );
}

export function ReferralsAdminClient({
  settings,
  events,
  rewards,
}: {
  settings: ReferralProgramSettings;
  events: Record<string, unknown>[];
  rewards: Record<string, unknown>[];
}) {
  const router = useRouter();
  const [saveState, saveAction, savePending] = useActionState<ReferralSaveResult | null, FormData>(
    saveReferralProgramSettingsAction,
    null,
  );

  useEffect(() => {
    if (saveState?.ok === true) router.refresh();
  }, [saveState, router]);

  const economics = analyzeReferralEconomics(settings);

  return (
    <div className="space-y-6">
      <form key={saveState?.ok ? 'saved' : 'edit'} action={saveAction} className="space-y-4 rounded-3xl border border-border bg-card p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Program settings</p>
        <p className="text-xs text-muted-foreground">
          Primary customer referral links are durable (no 24-hour expiry). Codes stay valid until revoked.
        </p>
        {saveState?.ok === false ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{saveState.error}</p>
        ) : null}
        {saveState?.ok === true ? (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
            Settings saved. Booking and rewards will use these values on the next checkout.
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="accent-[var(--gb-gold)]" /> Enable referral program
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">Referrer reward type<select name="referrer_reward_type" defaultValue={settings.referrerRewardType} className={inputClass}><option value="percent">Percent</option><option value="dollar">Dollar</option><option value="free_service">Free service</option><option value="custom">Custom</option></select></label>
          <label className="text-xs text-muted-foreground">Referrer reward value<input name="referrer_reward_value" type="number" defaultValue={settings.referrerRewardValue} className={inputClass} /></label>
          <label className="text-xs text-muted-foreground">Referred customer reward type<select name="referred_reward_type" defaultValue={settings.referredRewardType} className={inputClass}><option value="percent">Percent</option><option value="dollar">Dollar</option><option value="free_service">Free service</option><option value="custom">Custom</option></select></label>
          <label className="text-xs text-muted-foreground">Referred reward value<input name="referred_reward_value" type="number" defaultValue={settings.referredRewardValue} className={inputClass} /></label>
          <label className="text-xs text-muted-foreground">Min completed bookings before unlock<input name="min_completed_bookings" type="number" defaultValue={settings.minCompletedBookings} className={inputClass} /></label>
          <label className="text-xs text-muted-foreground">Max rewards per customer<input name="max_rewards_per_customer" type="number" defaultValue={settings.maxRewardsPerCustomer} className={inputClass} /></label>
          <label className="text-xs text-muted-foreground">Free detail at N referrals<input name="free_detail_threshold" type="number" defaultValue={settings.freeDetailReferralThreshold} className={inputClass} /></label>
          <label className="text-xs text-muted-foreground">Free detail service slug<input name="free_detail_service_slug" defaultValue={settings.freeDetailServiceSlug} className={inputClass} /></label>
          <label className="text-xs text-muted-foreground">Reward unlock rule
            <select name="reward_unlock_rule" defaultValue={settings.rewardUnlockRule} className={inputClass}>
              <option value="completed_paid">After completed paid job</option>
              <option value="booked">On booking only</option>
            </select>
          </label>
        </div>
        <RewardLadderEditor initial={settings.rewardLadder ?? []} />
        <label className="flex items-center gap-2 text-sm text-foreground md:col-span-2">
          <input type="checkbox" name="stacking_allowed" defaultChecked={settings.stackingAllowed} className="accent-[var(--gb-gold)]" />
          Allow referred discount to stack with larger public promos (default: off)
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" name="review_reward_enabled" defaultChecked={settings.reviewRewardEnabled} className="accent-[var(--gb-gold)]" /> Review reward enabled</label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">Review reward type<select name="review_reward_type" defaultValue={settings.reviewRewardType} className={inputClass}><option value="percent">Percent</option><option value="dollar">Dollar</option></select></label>
          <label className="text-xs text-muted-foreground">Review reward value<input name="review_reward_value" type="number" defaultValue={settings.reviewRewardValue} className={inputClass} /></label>
        </div>
        <button
          type="submit"
          disabled={savePending}
          className="rounded-xl bg-gold px-5 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-60"
        >
          {savePending ? 'Saving…' : 'Save settings'}
        </button>
      </form>

      <section className="rounded-3xl border border-gold/20 bg-gold/5 p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Titan referral economics</p>
        <p className="mt-2 text-sm text-foreground">
          Current reward: <span className="font-black">{economics.currentRewardLabel}</span>
          {' · '}
          Suggested: <span className="font-black text-gold-soft">{economics.suggestedRewardLabel}</span>
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Average referral customer spends ${economics.avgReferralSpend.toFixed(0)}. Expected ROI at suggested reward:{' '}
          <span className="font-black text-emerald-700">{economics.expectedRoiMultiple}x</span>. {economics.rationale}
        </p>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Program summary</p>
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border px-3 py-2">
            <dt className="text-muted-foreground">Referred discount</dt>
            <dd className="font-black text-gold-soft">
              {formatRewardSummary(settings.referredRewardType, settings.referredRewardValue)} off first detail
            </dd>
          </div>
          <div className="rounded-xl border border-border px-3 py-2">
            <dt className="text-muted-foreground">Referrer reward</dt>
            <dd className="font-black text-foreground">
              {formatRewardSummary(settings.referrerRewardType, settings.referrerRewardValue)} after completion
            </dd>
          </div>
          <div className="rounded-xl border border-border px-3 py-2">
            <dt className="text-muted-foreground">Stacking</dt>
            <dd className="font-black text-foreground">{settings.stackingAllowed ? 'Allowed' : 'Blocked (default)'}</dd>
          </div>
          <div className="rounded-xl border border-border px-3 py-2">
            <dt className="text-muted-foreground">Reward ladder</dt>
            <dd className="text-muted-foreground">{(settings.rewardLadder ?? []).map((t) => t.label).join(' · ')}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Manually attach referral</p>
        <ManualReferralAttach />
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Recent referrals</p>
        <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
          {events.length === 0 ? <li>No referral events yet — codes are created when customers are added.</li> : null}
          {events.slice(0, 15).map((e) => (
            <li key={String(e.id)} className="flex justify-between rounded-xl border border-border px-3 py-2">
              <span>{String(e.referral_code)} → {String(e.referred_email ?? e.referred_customer_id ?? 'unknown')}</span>
              <span className="uppercase text-gold-soft">{String(e.status)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Reward ledger</p>
        <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
          {rewards.length === 0 ? <li>No rewards issued yet.</li> : null}
          {rewards.slice(0, 15).map((r) => (
            <li key={String(r.id)} className="flex justify-between rounded-xl border border-border px-3 py-2">
              <span>{String(r.reward_type)} · {String(r.reward_value)}</span>
              <span className="uppercase">{String(r.status)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ManualReferralAttach() {
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Referral code" className={inputClass} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Referred customer email" className={inputClass} />
      <input value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)} placeholder="Appointment ID (optional)" className={inputClass} />
      <button
        type="button"
        disabled={pending || !code.trim()}
        onClick={() => {
          setMsg(null);
          startTransition(async () => {
            const res = await attachReferralToBookingAction({
              referralCode: code,
              customerEmail: email || undefined,
              appointmentId: appointmentId || undefined,
            });
            setMsg(res.error ?? 'Referral attached as pending/booked.');
          });
        }}
        className="sm:col-span-3 rounded-xl border border-gold/30 px-4 py-2 text-[10px] font-black uppercase text-gold-soft disabled:opacity-50"
      >
        Attach referral
      </button>
      {msg ? <p className="sm:col-span-3 text-xs text-emerald-700">{msg}</p> : null}
      <p className="sm:col-span-3 text-[10px] text-muted-foreground">Reward unlocks after referred job is completed and paid. No account required for referred customer at booking.</p>
    </div>
  );
}

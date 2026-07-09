'use client';

import { useActionState, useState, useTransition } from 'react';
import type { ReferralProgramSettings } from '@/lib/referral/referral-codes';
import { saveReferralProgramSettingsAction, type ReferralSaveResult } from '@/app/(dashboard)/admin/referrals/actions';
import { attachReferralToBookingAction } from '@/app/(dashboard)/admin/notifications/cadence-actions';

const inputClass = 'mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white';

export function ReferralsAdminClient({
  settings,
  events,
  rewards,
}: {
  settings: ReferralProgramSettings;
  events: Record<string, unknown>[];
  rewards: Record<string, unknown>[];
}) {
  const [saveState, saveAction, savePending] = useActionState<ReferralSaveResult | null, FormData>(
    saveReferralProgramSettingsAction,
    null,
  );

  return (
    <div className="space-y-6">
      <form action={saveAction} className="rounded-3xl border border-white/10 bg-black/50 p-5 space-y-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Program settings</p>
        {saveState?.ok === false ? (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{saveState.error}</p>
        ) : null}
        {saveState?.ok === true ? (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            Settings saved. Booking and rewards will use these values on the next checkout.
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="accent-[var(--gb-gold)]" /> Enable referral program
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-zinc-400">Referrer reward type<select name="referrer_reward_type" defaultValue={settings.referrerRewardType} className={inputClass}><option value="percent">Percent</option><option value="dollar">Dollar</option><option value="free_service">Free service</option><option value="custom">Custom</option></select></label>
          <label className="text-xs text-zinc-400">Referrer reward value<input name="referrer_reward_value" type="number" defaultValue={settings.referrerRewardValue} className={inputClass} /></label>
          <label className="text-xs text-zinc-400">Referred customer reward type<select name="referred_reward_type" defaultValue={settings.referredRewardType} className={inputClass}><option value="percent">Percent</option><option value="dollar">Dollar</option><option value="free_service">Free service</option><option value="custom">Custom</option></select></label>
          <label className="text-xs text-zinc-400">Referred reward value<input name="referred_reward_value" type="number" defaultValue={settings.referredRewardValue} className={inputClass} /></label>
          <label className="text-xs text-zinc-400">Min completed bookings before unlock<input name="min_completed_bookings" type="number" defaultValue={settings.minCompletedBookings} className={inputClass} /></label>
          <label className="text-xs text-zinc-400">Max rewards per customer<input name="max_rewards_per_customer" type="number" defaultValue={settings.maxRewardsPerCustomer} className={inputClass} /></label>
          <label className="text-xs text-zinc-400">Free detail at N referrals<input name="free_detail_threshold" type="number" defaultValue={settings.freeDetailReferralThreshold} className={inputClass} /></label>
          <label className="text-xs text-zinc-400">Free detail service slug<input name="free_detail_service_slug" defaultValue={settings.freeDetailServiceSlug} className={inputClass} /></label>
        </div>
        <label className="text-xs text-zinc-400 md:col-span-2">
          Reward ladder (JSON array: threshold, label, rewardType, rewardValue)
          <textarea
            name="reward_ladder_json"
            rows={5}
            defaultValue={JSON.stringify(settings.rewardLadder ?? [], null, 2)}
            className={`${inputClass} font-mono text-[11px]`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300 md:col-span-2">
          <input type="checkbox" name="stacking_allowed" defaultChecked={settings.stackingAllowed} className="accent-[var(--gb-gold)]" />
          Allow referred discount to stack with larger public promos (default: off)
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" name="review_reward_enabled" defaultChecked={settings.reviewRewardEnabled} className="accent-[var(--gb-gold)]" /> Review reward enabled</label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-zinc-400">Review reward type<select name="review_reward_type" defaultValue={settings.reviewRewardType} className={inputClass}><option value="percent">Percent</option><option value="dollar">Dollar</option></select></label>
          <label className="text-xs text-zinc-400">Review reward value<input name="review_reward_value" type="number" defaultValue={settings.reviewRewardValue} className={inputClass} /></label>
        </div>
        <button
          type="submit"
          disabled={savePending}
          className="rounded-xl bg-gold px-5 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-60"
        >
          {savePending ? 'Saving…' : 'Save settings'}
        </button>
      </form>

      <section className="rounded-3xl border border-white/10 bg-black/50 p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Program summary</p>
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/5 px-3 py-2">
            <dt className="text-zinc-500">Referred discount</dt>
            <dd className="font-black text-gold-soft">{settings.referredRewardValue}% off first detail</dd>
          </div>
          <div className="rounded-xl border border-white/5 px-3 py-2">
            <dt className="text-zinc-500">Referrer reward</dt>
            <dd className="font-black text-white">{settings.referrerRewardValue}% after completion</dd>
          </div>
          <div className="rounded-xl border border-white/5 px-3 py-2">
            <dt className="text-zinc-500">Stacking</dt>
            <dd className="font-black text-white">{settings.stackingAllowed ? 'Allowed' : 'Blocked (default)'}</dd>
          </div>
          <div className="rounded-xl border border-white/5 px-3 py-2">
            <dt className="text-zinc-500">Reward ladder</dt>
            <dd className="text-zinc-300">{(settings.rewardLadder ?? []).map((t) => t.label).join(' · ')}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/50 p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Manually attach referral</p>
        <ManualReferralAttach />
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/50 p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Recent referrals</p>
        <ul className="mt-3 space-y-2 text-xs text-zinc-300">
          {events.length === 0 ? <li className="text-zinc-500">No referral events yet — codes are created when customers are added.</li> : null}
          {events.slice(0, 15).map((e) => (
            <li key={String(e.id)} className="flex justify-between rounded-xl border border-white/5 px-3 py-2">
              <span>{String(e.referral_code)} → {String(e.referred_email ?? e.referred_customer_id ?? 'unknown')}</span>
              <span className="uppercase text-gold-soft">{String(e.status)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/50 p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Reward ledger</p>
        <ul className="mt-3 space-y-2 text-xs text-zinc-300">
          {rewards.length === 0 ? <li className="text-zinc-500">No rewards issued yet.</li> : null}
          {rewards.slice(0, 15).map((r) => (
            <li key={String(r.id)} className="flex justify-between rounded-xl border border-white/5 px-3 py-2">
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
      {msg ? <p className="sm:col-span-3 text-xs text-emerald-300">{msg}</p> : null}
      <p className="sm:col-span-3 text-[10px] text-zinc-600">Reward unlocks after referred job is completed and paid. No account required for referred customer at booking.</p>
    </div>
  );
}

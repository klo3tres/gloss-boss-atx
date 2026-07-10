'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Copy, Check, Gift, Share2, Sparkles, Star, Tag, MessageSquare, ChevronRight } from 'lucide-react';
import { PremiumBadge, SectionEyebrow } from '@/components/ui/premium';
import { techSendCustomSmsAction } from '@/app/(dashboard)/tech/tech-actions';
import { claimLoyaltyRewardForCustomerAction } from '@/app/(dashboard)/admin/customer-actions';
import { buildContextualMessage } from '@/lib/titan/contextual-messages';
import { displayMoney } from '@/lib/display-format';

export type WorkOrderMembershipPlan = {
  id: string;
  name: string;
  slug: string;
  tier: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  discountPercent: number;
  benefits: string[];
};

export type WorkOrderGrowthData = {
  customerId?: string;
  guestName: string;
  guestPhone?: string;
  serviceLabel?: string;
  vehicleLabel?: string;
  balanceDueCents?: number;
  visitCount?: number;
  avgTicketCents?: number;
  membershipPlans: WorkOrderMembershipPlan[];
  activeMembership?: { name: string; tier: string; status: string } | null;
  referralCode?: string;
  referralLink?: string;
  referralEnabled?: boolean;
  referrerRewardLabel?: string;
  referredRewardLabel?: string;
  loyaltyRewardThreshold?: number;
  loyaltyRewardDescription?: string;
  loyaltyRewardCents?: number;
  loyaltyProgressStamps?: number;
  loyaltyClaimableRewards?: number;
  loyaltyRewardCredits?: Array<{ id: string; amountCents: number; remainingCents: number; reason?: string }>;
  onlineDealLabel?: string;
  multiCarDealLabel?: string;
  activeOffers?: Array<{ id: string; label: string; detail: string }>;
  bookUrl?: string;
  membershipsUrl?: string;
};

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type='button'
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className='inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[10px] font-black uppercase text-muted-foreground transition hover:border-gold/40 hover:text-foreground'
    >
      {copied ? <Check className='h-3 w-3 text-emerald-400' /> : <Copy className='h-3 w-3' />}
      {copied ? 'Copied' : label ?? 'Copy'}
    </button>
  );
}

function ScriptCard({
  title,
  body,
  onSend,
  disabled,
  sending,
}: {
  title: string;
  body: string;
  onSend: () => void;
  disabled?: boolean;
  sending?: boolean;
}) {
  return (
    <div className='rounded-2xl border border-border bg-card/60 p-4'>
      <p className='text-[10px] font-black uppercase tracking-[0.18em] text-gold-soft'>{title}</p>
      <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>{body}</p>
      <div className='mt-3 flex flex-wrap gap-2'>
        <CopyButton text={body} label='Copy script' />
        <button
          type='button'
          disabled={disabled || sending}
          onClick={onSend}
          className='inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-[10px] font-black uppercase text-black transition hover:bg-gold-soft disabled:opacity-40'
        >
          <MessageSquare className='h-3 w-3' />
          {sending ? 'Sending…' : 'Send SMS'}
        </button>
      </div>
    </div>
  );
}

export function WorkOrderGrowthPanel({
  jobId,
  isFallback,
  data,
}: {
  jobId: string;
  isFallback: boolean;
  data: WorkOrderGrowthData;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [sendingScript, setSendingScript] = useState<string | null>(null);

  const base = typeof window !== 'undefined' ? window.location.origin : 'https://www.glossbossatx.com';
  const bookUrl = data.bookUrl ?? `${base}/book`;
  const membershipsUrl = data.membershipsUrl ?? `${base}/memberships`;

  const ctx = {
    customerName: data.guestName,
    vehicle: data.vehicleLabel,
    service: data.serviceLabel,
    balanceCents: data.balanceDueCents,
    visitCount: data.visitCount,
    avgTicketCents: data.avgTicketCents,
    membershipTier: data.activeMembership?.name ?? null,
    recommendedTier: data.membershipPlans.find((p) => p.tier === 'silver')?.name ?? 'Silver',
    bookUrl,
    referralUrl: data.referralLink,
  };

  const scripts = [
    { key: 'membership', title: 'Membership upsell', body: buildContextualMessage('membership', ctx) },
    { key: 'referral', title: 'Referral share', body: buildContextualMessage('referral', ctx) },
    { key: 'rebook', title: 'Rebook follow-up', body: buildContextualMessage('rebook', ctx) },
    { key: 'review', title: 'Review request', body: buildContextualMessage('review', ctx) },
  ];

  const sendSms = (body: string, kind: string, scriptKey: string) => {
    if (!data.guestPhone) {
      setMsg({ tone: 'err', text: 'No phone number on file for this customer.' });
      return;
    }
    setSendingScript(scriptKey);
    startTransition(async () => {
      setMsg(null);
      const fd = new FormData();
      fd.set('appointmentId', isFallback ? '' : jobId);
      fd.set('fallbackBookingId', isFallback ? jobId : '');
      fd.set('body', body);
      fd.set('kind', kind);
      const res = await techSendCustomSmsAction(fd);
      setSendingScript(null);
      setMsg({ tone: res.error ? 'err' : 'ok', text: res.error ?? res.message ?? 'SMS sent.' });
    });
  };

  const claimReward = () => {
    if (!data.customerId) return;
    startTransition(async () => {
      setMsg(null);
      const fd = new FormData();
      fd.set('customerId', data.customerId!);
      fd.set('workOrderId', jobId);
      const res = await claimLoyaltyRewardForCustomerAction(fd);
      setMsg({ tone: res.error ? 'err' : 'ok', text: res.error ?? res.message ?? 'Reward issued.' });
    });
  };

  return (
    <div className='space-y-6'>
      {msg ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${msg.tone === 'ok' ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100' : 'border-red-500/35 bg-red-500/10 text-red-100'}`}
          role='status'
        >
          {msg.text}
        </p>
      ) : null}

      {/* Deals & offers */}
      <section className='gb-premium-card rounded-3xl border border-gold/15 bg-card/40 p-6 shadow-xl'>
        <div className='flex items-center justify-between border-b border-border pb-3 mb-4'>
          <SectionEyebrow>Active deals & promotions</SectionEyebrow>
          <PremiumBadge tone='gold'>Live</PremiumBadge>
        </div>
        <div className='grid gap-3 sm:grid-cols-2'>
          {data.onlineDealLabel ? (
            <div className='flex items-start gap-3 rounded-2xl border border-border bg-background/50 p-4'>
              <Tag className='mt-0.5 h-4 w-4 shrink-0 text-gold-soft' />
              <div>
                <p className='text-xs font-black uppercase text-foreground'>Online booking</p>
                <p className='mt-1 text-sm text-muted-foreground'>{data.onlineDealLabel}</p>
              </div>
            </div>
          ) : null}
          {data.multiCarDealLabel ? (
            <div className='flex items-start gap-3 rounded-2xl border border-border bg-background/50 p-4'>
              <Tag className='mt-0.5 h-4 w-4 shrink-0 text-gold-soft' />
              <div>
                <p className='text-xs font-black uppercase text-foreground'>Multi-vehicle</p>
                <p className='mt-1 text-sm text-muted-foreground'>{data.multiCarDealLabel}</p>
              </div>
            </div>
          ) : null}
          {(data.activeOffers ?? []).map((o) => (
            <div key={o.id} className='flex items-start gap-3 rounded-2xl border border-border bg-background/50 p-4'>
              <Sparkles className='mt-0.5 h-4 w-4 shrink-0 text-violet-300' />
              <div>
                <p className='text-xs font-black uppercase text-foreground'>{o.label}</p>
                <p className='mt-1 text-sm text-muted-foreground'>{o.detail}</p>
              </div>
            </div>
          ))}
          {!data.onlineDealLabel && !data.multiCarDealLabel && !(data.activeOffers?.length) ? (
            <p className='col-span-full text-sm text-muted-foreground'>No active sitewide deals — check Admin → Promotions.</p>
          ) : null}
        </div>
      </section>

      {/* Membership */}
      <section className='gb-premium-card rounded-3xl border border-gold/15 bg-card/40 p-6 shadow-xl'>
        <div className='flex items-center justify-between border-b border-border pb-3 mb-4'>
          <SectionEyebrow>Membership</SectionEyebrow>
          {data.activeMembership ? (
            <PremiumBadge tone='emerald'>{data.activeMembership.name} · {data.activeMembership.status}</PremiumBadge>
          ) : (
            <PremiumBadge tone='amber'>Not enrolled</PremiumBadge>
          )}
        </div>
        {data.activeMembership ? (
          <p className='mb-4 text-sm text-muted-foreground'>
            Active {data.activeMembership.tier} member — mention member pricing and priority scheduling on close-out.
          </p>
        ) : (
          <p className='mb-4 text-sm text-muted-foreground'>
            Pitch a plan that matches their visit history. Plans load from Admin → Memberships.
          </p>
        )}
        <div className='grid gap-3 md:grid-cols-3'>
          {data.membershipPlans.map((plan) => {
            const monthly = plan.priceMonthlyCents > 0 ? displayMoney(plan.priceMonthlyCents) : null;
            const yearly = plan.priceYearlyCents > 0 ? displayMoney(plan.priceYearlyCents) : null;
            const pitchUrl = data.customerId
              ? `${membershipsUrl}?plan=${encodeURIComponent(plan.slug)}&customer=${data.customerId}`
              : `${membershipsUrl}?plan=${encodeURIComponent(plan.slug)}`;
            const pitch = `Gloss Boss ATX: ${plan.name} — ${plan.discountPercent}% off services, priority scheduling${plan.benefits.length ? `, ${plan.benefits.slice(0, 2).join(', ')}` : ''}. Join: ${pitchUrl}`;
            return (
              <div key={plan.id} className='rounded-2xl border border-border bg-background/50 p-4'>
                <div className='flex items-center gap-2'>
                  <Star className='h-4 w-4 text-gold-soft' />
                  <p className='font-black text-foreground'>{plan.name}</p>
                </div>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {monthly ? `${monthly}/mo` : ''}{monthly && yearly ? ' · ' : ''}{yearly ? `${yearly}/yr` : ''}
                  {plan.discountPercent > 0 ? ` · ${plan.discountPercent}% off` : ''}
                </p>
                <ul className='mt-2 space-y-1 text-xs text-muted-foreground'>
                  {plan.benefits.slice(0, 3).map((b) => (
                    <li key={b}>· {b}</li>
                  ))}
                </ul>
                <div className='mt-3 flex flex-wrap gap-2'>
                  <CopyButton text={pitch} label='Copy pitch' />
                  <button
                    type='button'
                    disabled={pending || !data.guestPhone}
                    onClick={() => sendSms(pitch, 'maintenance_offer', `plan-${plan.slug}`)}
                    className='text-[10px] font-black uppercase text-gold-soft underline disabled:opacity-40'
                  >
                    SMS pitch
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {data.membershipPlans.length === 0 ? (
          <Link href='/admin/memberships' className='mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase text-gold-soft'>
            Configure plans <ChevronRight className='h-3 w-3' />
          </Link>
        ) : null}
      </section>

      {/* Referrals */}
      {data.referralEnabled !== false ? (
        <section className='gb-premium-card rounded-3xl border border-gold/15 bg-card/40 p-6 shadow-xl'>
          <div className='flex items-center justify-between border-b border-border pb-3 mb-4'>
            <SectionEyebrow>Referral program</SectionEyebrow>
            <Share2 className='h-4 w-4 text-gold-soft' />
          </div>
          {data.referralCode && data.referralLink ? (
            <div className='space-y-3'>
              <div className='flex flex-wrap items-center gap-2'>
                <code className='rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm text-gold-soft'>{data.referralCode}</code>
                <CopyButton text={data.referralCode} label='Copy code' />
                <CopyButton text={data.referralLink} label='Copy link' />
              </div>
              <p className='text-xs text-muted-foreground'>
                Referrer: {data.referrerRewardLabel ?? '15% credit'} · New customer: {data.referredRewardLabel ?? '10% off first detail'}
              </p>
              <ScriptCard
                title='Share referral link'
                body={buildContextualMessage('referral', ctx)}
                onSend={() => sendSms(buildContextualMessage('referral', ctx), 'referral_share', 'referral')}
                disabled={!data.guestPhone}
                sending={sendingScript === 'referral'}
              />
            </div>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {data.customerId ? 'Generating referral code… refresh the page.' : 'Link a customer account to enable referral sharing.'}
            </p>
          )}
        </section>
      ) : null}

      {/* Loyalty rewards */}
      <section className='gb-premium-card rounded-3xl border border-gold/15 bg-card/40 p-6 shadow-xl'>
        <div className='flex items-center justify-between border-b border-border pb-3 mb-4'>
          <SectionEyebrow>Loyalty rewards</SectionEyebrow>
          <Gift className='h-4 w-4 text-gold-soft' />
        </div>
        {data.customerId ? (
          <div className='space-y-4'>
            <div className='flex flex-wrap items-center gap-3'>
              <PremiumBadge tone='gold'>
                {data.loyaltyProgressStamps ?? 0} / {data.loyaltyRewardThreshold ?? 5} stamps
              </PremiumBadge>
              {(data.loyaltyClaimableRewards ?? 0) > 0 ? (
                <PremiumBadge tone='emerald'>{data.loyaltyClaimableRewards} reward{(data.loyaltyClaimableRewards ?? 0) > 1 ? 's' : ''} ready</PremiumBadge>
              ) : null}
            </div>
            <p className='text-sm text-muted-foreground'>
              Reward: {data.loyaltyRewardDescription ?? 'Punch card credit'} ({displayMoney(data.loyaltyRewardCents ?? 7500)})
            </p>
            {(data.loyaltyClaimableRewards ?? 0) > 0 ? (
              <button
                type='button'
                disabled={pending}
                onClick={claimReward}
                className='rounded-xl bg-gold px-4 py-3 text-xs font-black uppercase text-black transition hover:bg-gold-soft disabled:opacity-40'
              >
                Issue loyalty reward credit to account
              </button>
            ) : (
              <p className='text-xs text-muted-foreground'>No claimable rewards — apply existing credits in Payments tab.</p>
            )}
            {(data.loyaltyRewardCredits?.length ?? 0) > 0 ? (
              <div className='rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4'>
                <p className='text-[10px] font-black uppercase text-emerald-300'>Available reward credits</p>
                <ul className='mt-2 space-y-2'>
                  {data.loyaltyRewardCredits!.map((c) => (
                    <li key={c.id} className='flex justify-between text-sm text-foreground'>
                      <span>{c.reason ?? 'Loyalty reward'}</span>
                      <span className='font-mono text-gold-soft'>{displayMoney(c.remainingCents)}</span>
                    </li>
                  ))}
                </ul>
                <p className='mt-2 text-xs text-muted-foreground'>Apply in Payments → Store credits.</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className='text-sm text-muted-foreground'>Register this customer to track punches and issue rewards.</p>
        )}
      </section>

      {/* Scripted outreach */}
      <section className='gb-premium-card rounded-3xl border border-gold/15 bg-card/40 p-6 shadow-xl'>
        <div className='flex items-center justify-between border-b border-border pb-3 mb-4'>
          <SectionEyebrow>Outreach scripts</SectionEyebrow>
          <MessageSquare className='h-4 w-4 text-gold-soft' />
        </div>
        <div className='grid gap-3 lg:grid-cols-2'>
          {scripts.map((s) => (
            <ScriptCard
              key={s.key}
              title={s.title}
              body={s.body}
              onSend={() => sendSms(s.body, s.key, s.key)}
              disabled={!data.guestPhone}
              sending={sendingScript === s.key}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

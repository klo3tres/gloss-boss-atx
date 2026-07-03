'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Car, Gift, MessageSquare, Sparkles, Star, Award, Calendar, Image, CreditCard, ShieldCheck, Tag, ArrowUpRight } from 'lucide-react';
import { GlassCard, IconTile, PremiumBadge, SectionEyebrow, TimelineRail } from '@/components/ui/premium';
import { LoyaltyCard3D } from '@/components/dashboard/loyalty-card-3d';
import { calculateLoyaltyStatus } from '@/lib/loyalty-ledger';
import type { CustomerApptSnapshotView } from '@/lib/customer-dashboard-snapshot';
import type { WeatherSnapshot } from '@/lib/weather-forecast';
import { WeatherReadinessWidget } from '@/components/widgets/weather-readiness-widget';
import { UpcomingScheduleWidget } from '@/components/widgets/upcoming-schedule-widget';
import type { ScheduleWidgetItem } from '@/lib/widgets/schedule-types';
import { CustomerReferralCard } from '@/components/customer/customer-referral-card';
import { LoyaltyClaimButton } from '@/components/dashboard/loyalty-claim-button';

export type CustomerAppt = {
  id: string;
  status: string;
  scheduled_start: string;
  service_slug: string;
  base_price_cents: number;
  deposit_amount_cents: number;
  balance_due_cents?: number | null;
  payment_status?: string | null;
  guest_email?: string | null;
  service_address?: string | null;
  service_city?: string | null;
  service_state?: string | null;
  service_zip?: string | null;
  booking_vehicles?: unknown;
  vehicle_class: string;
};

export type CustomerDashboardProps = {
  googleReviewUrl?: string;
  liveJob: CustomerAppt | null;
  liveEvents: Array<{ event_type: string; created_at: string }>;
  upcoming: CustomerAppt[];
  inFlight?: CustomerAppt[];
  pending?: CustomerAppt[];
  history: CustomerAppt[];
  eventsByAppt: Record<string, Array<{ event_type: string; created_at: string }>>;
  paymentsByAppt: Record<string, Array<{ amount_cents: number; status: string }>>;
  receiptsByAppt: Record<string, Array<{ receipt_number: string | null; created_at: string }>>;
  agreementByAppt: Record<string, boolean>;
  agreementHrefByAppt: Record<string, string>;
  photosByAppt: Record<string, Array<{ file_url: string; category: string }>>;
  vehicleTotal: number;
  receiptTotal: number;
  photoTotal: number;
  agreementTotal: number;
  appointmentCount: number;
  snapshotByAppt?: Record<string, CustomerApptSnapshotView>;
  loyaltyStampsCount?: number;
  loyaltyCanClaim?: boolean;
  loyaltyClaimableCount?: number;
  loyaltyRewardDescription?: string;
  activeCardDesign?: any;
  membership?: CustomerMembershipView | null;
  accountCreditBalanceCents?: number;
  activeDeals?: Array<{ id: string; title: string; description: string; discount: string }>;
  weatherForecast?: WeatherSnapshot | null;
  weatherLocationLabel?: string;
  referralCode?: string | null;
  referralLink?: string | null;
  referralCompletedCount?: number;
  referralBookedCount?: number;
  referralSentCount?: number;
  referralRewardsEarned?: number;
  referralRewardsAvailable?: number;
  referralProgramEnabled?: boolean;
  referralRewardRules?: string;
  referralFreeDetailThreshold?: number;
  referralPendingCount?: number;
  referralGivePercent?: number;
  referralGetPercent?: number;
  referralRewardLadder?: import('@/lib/referral/referral-codes').ReferralRewardLadderTier[];
  highlightJobId?: string;
};

export type CustomerMembershipView = {
  status: string;
  tier: string;
  name: string;
  billingInterval: string;
  priceCents: number;
  discountPercent: number;
  creditBalanceCents: number;
  currentPeriodEnd: string | null;
  endsAt: string | null;
  benefits: string[];
  includedServices: string[];
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function apptFromSnapshot(appt: CustomerAppt, snap?: CustomerApptSnapshotView): CustomerAppt & { snap?: CustomerApptSnapshotView } {
  if (!snap) return appt;
  const vehicles = Array.isArray(snap.vehicles) ? snap.vehicles : [];
  return {
    ...appt,
    base_price_cents: snap.finalTotalCents,
    deposit_amount_cents: snap.depositPaidCents,
    balance_due_cents: snap.balanceDueCents,
    payment_status: snap.paymentStatus,
    service_address: snap.serviceAddress || appt.service_address,
    booking_vehicles: vehicles.map((v) => ({
      vehicle_description: v?.description ?? 'Vehicle',
      service_slug: v?.serviceSlug ?? appt.service_slug ?? 'service',
      vehicle_class: v?.vehicleClass ?? appt.vehicle_class ?? '',
      add_on_slugs: Array.isArray(v?.addOns) ? v.addOns.map((a) => a?.label ?? '').filter(Boolean) : [],
    })),
    snap,
  };
}

function safeSlug(slug: string | null | undefined) {
  return (slug ?? 'service').replace(/-/g, ' ');
}

function chicago(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return '—';
  }
}

function friendlyEvent(t: string) {
  return t.replace(/_/g, ' ');
}

function vehiclesFrom(appt: CustomerAppt) {
  const raw = appt.booking_vehicles;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((v, i) => {
      const row = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
      return String(row.vehicle_description ?? row.description ?? `Vehicle ${i + 1}`);
    });
  }
  return ['Vehicle on file'];
}

function tierTheme(tier?: string) {
  const t = String(tier ?? '').toLowerCase();
  if (t.includes('gold')) return {
    label: 'Gold Member',
    border: 'border-amber-300/45',
    glow: 'shadow-[0_0_42px_rgba(245,197,66,0.16)]',
    chip: 'bg-amber-300 text-black',
    text: 'text-amber-200',
  };
  if (t.includes('silver')) return {
    label: 'Silver Member',
    border: 'border-zinc-300/35',
    glow: 'shadow-[0_0_38px_rgba(212,212,216,0.12)]',
    chip: 'bg-zinc-200 text-black',
    text: 'text-zinc-200',
  };
  if (t.includes('bronze')) return {
    label: 'Bronze Member',
    border: 'border-orange-300/35',
    glow: 'shadow-[0_0_38px_rgba(251,146,60,0.12)]',
    chip: 'bg-orange-300 text-black',
    text: 'text-orange-200',
  };
  return {
    label: 'Gloss Boss Member',
    border: 'border-gold/30',
    glow: 'shadow-[0_0_34px_rgba(212,175,55,0.12)]',
    chip: 'bg-gold text-black',
    text: 'text-gold-soft',
  };
}

export function CustomerDashboardClient(props: CustomerDashboardProps) {
  const loyaltyVisits = typeof props.loyaltyStampsCount === 'number'
    ? props.loyaltyStampsCount
    : (props.history ?? []).filter((a) => a.status === 'completed').length;

  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [memberTab, setMemberTab] = useState<'benefits' | 'credits' | 'deals'>('benefits');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopyDeal = (code: string, navigate = false) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
    if (navigate) window.location.assign(`/book?promo=${encodeURIComponent(code)}`);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const box = card.getBoundingClientRect();
    const x = e.clientX - box.left - box.width / 2;
    const y = e.clientY - box.top - box.height / 2;
    setRotateX(-y / 12);
    setRotateY(x / 12);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
    setIsHovered(false);
  };

  const highlightRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (props.highlightJobId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [props.highlightJobId]);
  
  // Extract garage list of unique vehicles
  const uniqueVehicles = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ description: string; vehicleClass: string }> = [];
    const allAppts = [...(props.history ?? []), ...(props.inFlight ?? []), ...(props.pending ?? []), ...(props.upcoming ?? [])];
    for (const raw of allAppts) {
      const a = apptFromSnapshot(raw, props.snapshotByAppt?.[raw.id]);
      const vehicles = a.booking_vehicles;
      if (Array.isArray(vehicles)) {
        for (const v of vehicles) {
          const row = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
          const desc = String(row.vehicle_description ?? row.description ?? '').trim();
          if (desc && !seen.has(desc.toLowerCase())) {
            seen.add(desc.toLowerCase());
            list.push({
              description: desc,
              vehicleClass: String(row.vehicle_class ?? a.vehicle_class ?? 'Standard'),
            });
          }
        }
      }
    }
    return list;
  }, [props.history, props.inFlight, props.pending, props.upcoming, props.snapshotByAppt]);

  // Compile all uploaded before/after gallery photos
  const allGalleryPhotos = useMemo(() => {
    const photos: Array<{ url: string; category: string; apptId: string; service: string }> = [];
    for (const [apptId, list] of Object.entries(props.photosByAppt)) {
      const appt = props.history.find(h => h.id === apptId) || props.upcoming.find(u => u.id === apptId);
      const service = appt ? safeSlug(appt.service_slug) : 'Detail';
      for (const p of list) {
        photos.push({ url: p.file_url, category: p.category, apptId, service });
      }
    }
    return photos;
  }, [props.photosByAppt, props.history, props.upcoming]);

  const appointmentCards = useMemo(() => {
    const seen = new Set<string>();
    const out: CustomerAppt[] = [];
    for (const a of [...(props.inFlight ?? []), ...(props.pending ?? []), ...(props.upcoming ?? [])]) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
    return out;
  }, [props.inFlight, props.pending, props.upcoming]);

  const scheduleItems: ScheduleWidgetItem[] = useMemo(() => {
    return appointmentCards.map((a) => {
      const snap = props.snapshotByAppt?.[a.id];
      const merged = apptFromSnapshot(a, snap);
      const addr =
        merged.service_address ||
        [a.service_address, a.service_city, a.service_state, a.service_zip].filter(Boolean).join(', ');
      return {
        id: a.id,
        scheduledStart: a.scheduled_start,
        title: safeSlug(a.service_slug),
        subtitle: vehiclesFrom(merged).join(' · '),
        address: addr || undefined,
        status: a.status,
      };
    });
  }, [appointmentCards, props.snapshotByAppt]);

  const liveJob = props.liveJob
    ? apptFromSnapshot(props.liveJob, props.snapshotByAppt?.[props.liveJob.id])
    : null;

  const reviewUrl = props.googleReviewUrl?.trim() || '';
  const membership = props.membership ?? null;
  const availableCreditCents = Math.max(0, props.accountCreditBalanceCents ?? membership?.creditBalanceCents ?? 0);
  const theme = tierTheme(membership?.tier);
  const lastCompleted = props.history[0] ? apptFromSnapshot(props.history[0], props.snapshotByAppt?.[props.history[0].id]) : null;
  const nextRecommended = lastCompleted
    ? new Date(new Date(lastCompleted.scheduled_start).getTime() + 21 * 24 * 60 * 60 * 1000)
    : null;

  // Loyalty stepper variables. The card has 5 standard punches plus a 6th reward slot.
  const loyalty = calculateLoyaltyStatus([{ stamp_count: loyaltyVisits }]);
  const loyaltyTarget = loyalty.rewardThreshold;
  const currentStep = loyalty.progressStamps;
  const isRewardReady = loyalty.rewardReady;
  const loyaltyPercent = Math.round((currentStep / loyaltyTarget) * 100);
  const punchesVisual = Array.from({ length: loyaltyTarget }, (_, i) => i < currentStep || isRewardReady);

  return (
    <div className="space-y-8 rounded-3xl p-1 sm:p-2">
      {props.referralCode && props.referralLink ? (
        <CustomerReferralCard
          referralCode={props.referralCode}
          referralLink={props.referralLink}
          completedReferrals={props.referralCompletedCount ?? 0}
          bookedReferrals={props.referralBookedCount}
          pendingReferrals={props.referralPendingCount}
          sentReferrals={props.referralSentCount}
          rewardsEarned={props.referralRewardsEarned}
          rewardsAvailable={props.referralRewardsAvailable}
          threshold={props.referralFreeDetailThreshold ?? 5}
          rewardRules={props.referralRewardRules}
          givePercent={props.referralGivePercent}
          getPercent={props.referralGetPercent}
          rewardLadder={props.referralRewardLadder}
          enabled={props.referralProgramEnabled !== false}
        />
      ) : null}
      <section className={`overflow-hidden rounded-3xl border ${theme.border} bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.18),transparent_34%),linear-gradient(135deg,rgba(24,24,27,0.96),rgba(0,0,0,0.96))] p-6 ${theme.glow}`}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${theme.chip}`}>
                {membership ? theme.label : 'Member Pricing Available'}
              </span>
              <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-300">
                {membership?.status ?? 'Sign in upgrade ready'}
              </span>
            </div>
            <h2 className="mt-4 text-3xl font-black uppercase leading-none tracking-tight text-white sm:text-4xl">
              {membership ? membership.name : 'Unlock Gloss Boss Memberships'}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
              {membership
                ? `Your ${membership.billingInterval} plan keeps your vehicle on schedule with member pricing, loyalty progress, and priority booking in one place.`
                : 'Join a monthly plan to unlock member pricing, loyalty stamps, priority scheduling, credits, and simpler repeat booking.'}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Discount</p>
                <p className={`mt-1 font-mono text-xl font-black ${theme.text}`}>{membership ? `${membership.discountPercent}%` : 'Members'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Credits</p>
                <p className={`mt-1 font-mono text-xl font-black ${theme.text}`}>{money(availableCreditCents)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Punches</p>
                <p className={`mt-1 font-mono text-xl font-black ${theme.text}`}>{isRewardReady ? 'Reward' : `${currentStep}/${loyaltyTarget}`}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Renews</p>
                <p className={`mt-1 text-sm font-black ${theme.text}`}>
                  {membership?.currentPeriodEnd ? new Date(membership.currentPeriodEnd).toLocaleDateString() : membership?.endsAt ? `Ends ${new Date(membership.endsAt).toLocaleDateString()}` : 'On file'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex min-w-[260px] flex-col justify-between rounded-3xl border border-white/10 bg-black/50 p-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft">Next best action</p>
              <p className="mt-2 text-lg font-black uppercase text-white">
                {nextRecommended ? `Recommended ${nextRecommended.toLocaleDateString()}` : 'Start your shine schedule'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {lastCompleted ? `Based on your last ${safeSlug(lastCompleted.service_slug)}.` : 'Book your first member detail and start earning stamps.'}
              </p>
            </div>
            <div className="mt-5 grid gap-2">
              <Link href="/book" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-gold via-gold-soft to-gold px-4 py-3 text-xs font-black uppercase tracking-wider text-black hover:brightness-110">
                Book with member pricing <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link href="/memberships" className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-black/35 px-4 py-3 text-xs font-black uppercase tracking-wider text-white hover:border-gold/40 hover:text-gold-soft">
                {membership ? 'Upgrade membership' : 'View memberships'}
              </Link>
              {membership ? (
                <Link href="/dashboard/settings" className="inline-flex items-center justify-center rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-rose-100 hover:bg-rose-500/15">
                  Manage renewal
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-black/35 p-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              ['benefits', 'Benefits', ShieldCheck],
              ['credits', 'Credits', CreditCard],
              ['deals', 'Deals', Tag],
            ].map(([key, label, Icon]) => (
              <button
                key={String(key)}
                type="button"
                onClick={() => setMemberTab(key as typeof memberTab)}
                className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-[10px] font-black uppercase tracking-wider transition ${memberTab === key ? 'bg-gold text-black' : 'bg-zinc-950/60 text-zinc-400 hover:text-white'}`}
              >
                <Icon className="h-4 w-4" /> {String(label)}
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-2xl border border-white/10 bg-zinc-950/45 p-4">
            {memberTab === 'benefits' ? (
              <div className="grid gap-3 md:grid-cols-2">
                {(membership?.benefits?.length ? membership.benefits : ['Member pricing on eligible details', 'Priority scheduling window', 'Digital punch-card rewards', 'Cleaner repeat-booking experience']).slice(0, 6).map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm text-zinc-200">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold-soft" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            ) : memberTab === 'credits' ? (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                  <p className="text-[10px] font-black uppercase text-zinc-500">Available credit</p>
                  <p className="mt-1 font-mono text-2xl font-black text-gold-soft">{money(availableCreditCents)}</p>
                  <p className="mt-2 text-[11px] text-zinc-500">Apply credits in full or partially during booking after sign-in.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                  <p className="text-[10px] font-black uppercase text-zinc-500">Reward progress</p>
                  <div className="mt-2 flex gap-1.5">
                    {punchesVisual.map((filled, i) => (
                      <span key={i} className={`h-3 w-3 rounded-full border ${filled ? 'border-gold bg-gold shadow-[0_0_12px_rgba(212,175,55,0.45)]' : 'border-white/20 bg-white/5'}`} />
                    ))}
                  </div>
                  <p className="mt-2 font-mono text-lg font-black text-white">{isRewardReady ? 'Reward ready' : `${currentStep}/${loyaltyTarget}`}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                  <p className="text-[10px] font-black uppercase text-zinc-500">Reward menu</p>
                  <p className="mt-1 text-sm font-bold text-zinc-200">{isRewardReady ? 'Your next reward is ready to redeem on your next booking.' : 'Free wash reward unlocks when your punch card is full.'}</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {(props.activeDeals ?? []).length === 0 ? (
                  <p className="text-sm text-zinc-500">No active promos are published right now. Member pricing still applies when eligible.</p>
                ) : (
                  (props.activeDeals ?? []).slice(0, 4).map((deal) => {
                    const isCopied = copiedCode === deal.title;
                    return (
                      <div
                        key={deal.id}
                        onClick={() => handleCopyDeal(deal.title, true)}
                        className="group relative rounded-2xl border border-gold/20 bg-gold/5 p-4 hover:border-gold/40 hover:bg-gold/10 transition cursor-pointer flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-black uppercase text-white tracking-wider">{deal.title}</p>
                            <span className="text-[10px] font-bold text-gold-soft uppercase">
                              {isCopied ? '✓ Copied' : 'Click to copy code'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-zinc-400">{deal.description}</p>
                          <p className="mt-2 text-xs font-black uppercase text-gold-soft">{deal.discount}</p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                          <span className="text-[10px] text-zinc-500">Code: <code className="text-white font-mono bg-black/40 px-1.5 py-0.5 rounded border border-white/10">{deal.title}</code></span>
                          <Link
                            href={`/book?promo=${encodeURIComponent(deal.title)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-xl bg-gold hover:bg-gold-soft px-3 py-1.5 text-[10px] font-black uppercase text-black transition"
                          >
                            Use code <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Review Callout */}
      <section className="gb-premium-card rounded-3xl border border-gold/30 p-6 shadow-[0_0_40px_rgba(212,175,55,0.15)] backdrop-blur">
        <SectionEyebrow>Thank you</SectionEyebrow>
        <p className="mt-2 text-lg font-black text-white uppercase tracking-tight">Love your shine? Leave a Google review</p>
        <p className="mt-1 text-sm text-zinc-400">Helps Gloss Boss ATX grow — takes under a minute.</p>
        {reviewUrl ? (
          <a
            href={reviewUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-gold via-gold-soft to-gold px-6 py-4 text-sm font-black uppercase tracking-wider text-black shadow-[0_0_32px_rgba(212,175,55,0.35)] hover:brightness-110 transition duration-300"
          >
            <Star className="h-5 w-5 fill-black" /> Leave Google review
          </a>
        ) : (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Review link loading — refresh shortly or contact support.
          </p>
        )}
      </section>

      {/* Live Job tracker */}
      {liveJob ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="gb-premium-card rounded-3xl border border-emerald-500/35 p-6 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-300" />
            <SectionEyebrow>Live service</SectionEyebrow>
          </div>
          <p className="mt-3 text-2xl font-black text-white uppercase tracking-tight">Your detail is in progress</p>
          <p className="mt-1 text-zinc-400">
            {safeSlug(liveJob.service_slug)} · {chicago(liveJob.scheduled_start)}
          </p>
          {liveJob.balance_due_cents != null && liveJob.balance_due_cents > 0 ? (
            <p className="mt-2 text-sm text-amber-200 font-bold">Balance due {money(liveJob.balance_due_cents)}</p>
          ) : null}
          {props.liveEvents.length > 0 ? (
            <div className="mt-4 border-t border-white/5 pt-4">
              <TimelineRail
                events={props.liveEvents.slice(0, 6).map((e, i) => ({
                  id: `${e.event_type}-${i}`,
                  title: friendlyEvent(e.event_type),
                  time: chicago(e.created_at),
                }))}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Updates appear here as your technician progresses.</p>
          )}
        </motion.div>
      ) : null}

      {/* Grid of Key summaries */}
      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <IconTile icon={<Car className="h-5 w-5" />} label="Garage Count" value={`${uniqueVehicles.length} vehicles`} />
        <IconTile icon={<Calendar className="h-5 w-5" />} label="Upcoming" value={`${appointmentCards.length} appointments`} />
        <IconTile icon={<Award className="h-5 w-5" />} label="Loyalty Stamps" value={`${loyaltyVisits} earned`} />
        <IconTile icon={<MessageSquare className="h-5 w-5" />} label="Inbox Logs" value={`${props.agreementTotal} signed docs`} href="/dashboard/messages" />
      </section>

      {/* Main content grid */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        {/* Left Column: Scheduled Appointments & Vehicles Garage */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <UpcomingScheduleWidget
            items={scheduleItems}
            title="Your calendar"
            subtitle="Upcoming appointments"
            emptyMessage="No upcoming details scheduled."
            bookHref="/book"
          />

          {/* Upcoming detail cards */}
          <GlassCard glow>
            <SectionEyebrow>Upcoming appointments</SectionEyebrow>
            {(props.inFlight?.length ?? 0) > 0 ? (
              <p className="mt-2 text-xs text-emerald-300 font-bold uppercase tracking-wider">{props.inFlight!.length} in progress right now</p>
            ) : null}
            {(props.pending?.length ?? 0) > 0 ? (
              <p className="mt-1 text-xs text-amber-200 font-bold uppercase tracking-wider">{props.pending!.length} pending confirmation or payment</p>
            ) : null}
            <ul className="mt-5 space-y-4">
              {appointmentCards.length === 0 ? (
                <li className="text-sm text-zinc-500 italic py-6 border border-dashed border-white/5 rounded-2xl text-center">
                  No upcoming details scheduled.
                </li>
              ) : null}
              {appointmentCards.map((raw) => {
                const a = apptFromSnapshot(raw, props.snapshotByAppt?.[raw.id]);
                const isHighlighted = props.highlightJobId === a.id;
                const receipts = props.receiptsByAppt[a.id] ?? [];
                const addr =
                  a.service_address ||
                  [raw.service_address, raw.service_city, raw.service_state, raw.service_zip].filter(Boolean).join(', ');
                return (
                  <li
                    key={a.id}
                    ref={isHighlighted ? highlightRef : undefined}
                    className={`gb-premium-card rounded-2xl border bg-black/40 p-5 transition duration-300 ${
                      isHighlighted
                        ? 'border-gold/60 shadow-[0_0_28px_rgba(212,175,55,0.25)] ring-2 ring-gold/40'
                        : 'border-gold/15 hover:border-gold/30 hover:shadow-[0_0_20px_rgba(212,175,55,0.08)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-black uppercase tracking-tight text-white">{safeSlug(a.service_slug)}</p>
                        <p className="text-sm text-gold-soft font-medium mt-0.5">{chicago(a.scheduled_start)}</p>
                        {a.balance_due_cents != null && a.balance_due_cents > 0 ? (
                          <p className="mt-1.5 text-xs font-bold text-amber-200 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded inline-block">Balance due {money(a.balance_due_cents)}</p>
                        ) : (
                          <p className="mt-1.5 text-xs text-zinc-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded inline-block">Total {money(a.base_price_cents)}</p>
                        )}
                      </div>
                      {props.agreementByAppt[a.id] && props.agreementHrefByAppt[a.id] ? (
                        <Link href={props.agreementHrefByAppt[a.id]} className="text-xs font-black uppercase tracking-wider text-gold-soft hover:underline">
                          View agreement PDF
                        </Link>
                      ) : (
                        <PremiumBadge tone="amber">Agreement pending</PremiumBadge>
                      )}
                    </div>
                    <p className="mt-4 text-sm text-zinc-300 border-t border-white/5 pt-3">{addr || 'Address pending'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {vehiclesFrom(a).map((v) => (
                        <span key={v} className="rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs text-zinc-300 font-bold">
                          {v}
                        </span>
                      ))}
                    </div>
                    {receipts[0] ? (
                      <p className="mt-3 text-xs text-emerald-300/90 font-mono">Receipt {receipts[0].receipt_number ?? 'on file'} · {chicago(receipts[0].created_at)}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </GlassCard>

          {/* Vehicle Garage Grid */}
          <GlassCard>
            <SectionEyebrow>Vehicle Garage</SectionEyebrow>
            {uniqueVehicles.length === 0 ? (
              <p className="text-xs text-zinc-500 italic mt-4 py-4 text-center">No vehicles in your virtual garage yet.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {uniqueVehicles.map((v, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3.5 rounded-2xl border border-white/5 bg-zinc-950/20 p-4 hover:border-gold/25 transition duration-300"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold-soft">
                      <Car className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{v.description}</p>
                      <span className="inline-block mt-0.5 rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-black uppercase text-zinc-400">
                        {v.vehicleClass}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Right Column: Weather + Loyalty */}
        <div className="min-w-0 space-y-6">
          <WeatherReadinessWidget
            snapshot={props.weatherForecast ?? null}
            locationLabel={props.weatherLocationLabel ?? 'Austin service area'}
            variant="customer"
          />
          {/* Luxury 3D Carbon & Gold Punch Card */}
          <LoyaltyCard3D 
            activeCardDesign={props.activeCardDesign} 
            stampsCount={loyaltyVisits} 
            customerEmail={membership ? `${theme.label} · ${membership.status}` : (props.history[0]?.guest_email || 'Gloss Boss Customer')}
          />
          <p className="text-[10px] text-zinc-500 text-center mt-1">
            💡 Click card to flip front/back
          </p>

          {/* Stepper Progress Visualizer (Subtle text info card) */}
          <GlassCard className="border-zinc-900 bg-black/30 mt-2">
            <p className="text-xs text-zinc-500 text-center leading-relaxed">
              {isRewardReady
                ? props.loyaltyCanClaim
                  ? `Your punch reward is ready — claim ${props.loyaltyClaimableCount ?? 1} credit${(props.loyaltyClaimableCount ?? 1) === 1 ? '' : 's'} now. It auto-applies when you book.`
                  : props.accountCreditBalanceCents && props.accountCreditBalanceCents > 0
                    ? 'Your punch reward credit is on your account and will auto-apply at checkout.'
                    : 'Your punch reward is ready. Claim it below, then book your next visit.'
                : `Complete ${loyalty.stampsUntilReward} more service${loyalty.stampsUntilReward === 1 ? '' : 's'} to unlock your next luxury detailing reward.`}
            </p>
            {props.loyaltyCanClaim ? <LoyaltyClaimButton count={props.loyaltyClaimableCount} /> : null}
            <Link
              href="/book"
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold py-3 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_24px_rgba(212,175,55,0.15)] hover:brightness-110 transition duration-300"
            >
              Book Detailing Service
            </Link>
          </GlassCard>

          {/* Google Review Box */}
          <GlassCard>
            <SectionEyebrow>Reviews</SectionEyebrow>
            <p className="mt-3 text-sm text-zinc-400">Share how we did after your last visit.</p>
            {props.googleReviewUrl ? (
              <a
                href={props.googleReviewUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold px-4 py-3.5 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_24px_rgba(212,175,55,0.25)] hover:brightness-110 transition duration-300"
              >
                <Star className="h-4 w-4 fill-black" /> LEAVE GOOGLE REVIEW
              </a>
            ) : (
              <p className="mt-4 text-xs text-zinc-500 italic">Google review link is not configured yet. Contact support if you would like to leave feedback.</p>
            )}
          </GlassCard>

          {/* Gift Cards */}
          <GlassCard>
            <SectionEyebrow>Gift cards</SectionEyebrow>
            <Link href="/gift-cards" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-white hover:text-gold-soft transition duration-200">
              <Gift className="h-4 w-4 text-gold-soft" /> Send a detail to someone
            </Link>
          </GlassCard>
        </div>
      </div>

      {/* Cinematic Transformations Before/After Gallery */}
      {allGalleryPhotos.length > 0 && (
        <GlassCard>
          <div className="flex items-center justify-between border-b border-white/5 pb-3.5 mb-5">
            <div>
              <SectionEyebrow>Client Gallery</SectionEyebrow>
              <h3 className="text-lg font-black text-white mt-1">Cinematic Transformations</h3>
            </div>
            <Image className="h-5 w-5 text-gold-soft" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {allGalleryPhotos.map((p, idx) => (
              <div
                key={idx}
                className="group relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-950/40 aspect-square hover:border-gold/30 transition duration-300"
              >
                <img
                  src={p.url}
                  alt={p.service}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                  <span className="text-[9px] font-black uppercase text-gold-soft tracking-wider">
                    {p.category}
                  </span>
                  <p className="text-xs font-bold text-white truncate mt-0.5">
                    {p.service}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Service history list */}
      <GlassCard>
        <SectionEyebrow>Service history</SectionEyebrow>
        <ul className="mt-5 grid gap-4 md:grid-cols-2">
          {props.history.length === 0 ? <li className="text-sm text-zinc-500 italic">No completed visits yet.</li> : null}
          {props.history.map((raw) => {
            const a = apptFromSnapshot(raw, props.snapshotByAppt?.[raw.id]);
            const photos = props.photosByAppt[a.id] ?? [];
            const payments = props.paymentsByAppt[a.id] ?? [];
            return (
              <li key={a.id} className="rounded-2xl border border-white/5 bg-black/40 p-5 hover:border-gold/20 transition">
                <p className="font-black uppercase text-white tracking-tight">{safeSlug(a.service_slug)}</p>
                <p className="text-xs text-zinc-500 font-medium mt-0.5">{chicago(a.scheduled_start)}</p>
                <p className="mt-2 text-xs text-zinc-400 font-mono">Total {money(a.base_price_cents)}</p>
                {payments[0] ? (
                  <p className="text-xs text-emerald-300/90 font-mono mt-1">
                    Paid {money(payments[0].amount_cents)} · {payments[0].status}
                  </p>
                ) : null}
                {photos.length > 0 ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {photos.slice(0, 4).map((p) => (
                      <a key={p.file_url} href={p.file_url} target="_blank" rel="noreferrer" className="block shrink-0 transition-transform hover:scale-105">
                        <img src={p.file_url} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-gold/20" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </GlassCard>

      <div className="flex flex-wrap gap-4">
        <Link href="/book" className="rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold px-8 py-4 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_24px_rgba(212,175,55,0.25)] hover:brightness-110 transition duration-300">
          Rebook service
        </Link>
        {Object.keys(props.agreementHrefByAppt).length > 0 ? (
          <Link
            href={props.agreementHrefByAppt[Object.keys(props.agreementHrefByAppt)[0]!]}
            className="rounded-xl border border-white/20 bg-black/40 px-8 py-4 text-xs font-black uppercase tracking-widest text-white hover:border-gold/45 hover:text-gold-soft transition duration-300"
          >
            View signed agreement
          </Link>
        ) : null}
      </div>
    </div>
  );
}

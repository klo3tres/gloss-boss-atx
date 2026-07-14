import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { CustomerReferralCard } from '@/components/customer/customer-referral-card';
import { ensureCustomerReferralCode, formatReferralHeadline, loadReferralProgramSettings, referralLinkForCode } from '@/lib/referral/referral-codes';
import { loadReferralStatsForCustomer } from '@/lib/referral/referral-events';
import { PremiumButton } from '@/components/premium/premium-button';
import { PremiumEyebrow } from '@/components/premium/premium-eyebrow';
import { StickyBookCta } from '@/components/premium/sticky-book-cta';

export const dynamic = 'force-dynamic';

export default async function ReferralsLandingPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  const email = session.user?.email?.trim().toLowerCase();

  let referralProps: {
    referralCode: string;
    referralLink: string;
    completedReferrals: number;
    bookedReferrals: number;
    pendingReferrals: number;
    sentReferrals: number;
    rewardsEarned: number;
    rewardsAvailable: number;
    threshold: number;
    rewardRules: string;
    givePercent: number;
    getPercent: number;
    rewardLadder: import('@/lib/referral/referral-codes').ReferralRewardLadderTier[];
    enabled: boolean;
  } | null = null;

  if (admin && email) {
    const { data: customer } = await admin.from('customers').select('id').ilike('email', email).maybeSingle();
    const customerId = customer?.id ? String(customer.id) : '';
    if (customerId) {
      const settings = await loadReferralProgramSettings(admin);
      const codeRow = await ensureCustomerReferralCode(admin, customerId);
      const stats = await loadReferralStatsForCustomer(admin, customerId);
      referralProps = {
        referralCode: codeRow.code,
        referralLink: referralLinkForCode(codeRow.code),
        completedReferrals: stats.completed,
        bookedReferrals: stats.booked,
        pendingReferrals: stats.pending,
        sentReferrals: stats.sent,
        rewardsEarned: stats.rewardsEarned,
        rewardsAvailable: stats.rewardsAvailable,
        threshold: settings.freeDetailReferralThreshold,
        rewardRules: `${formatReferralHeadline(settings)} Your reward unlocks after your friend's completed paid appointment.`,
        givePercent: settings.referredRewardValue,
        getPercent: settings.referrerRewardValue,
        rewardLadder: settings.rewardLadder ?? [],
        enabled: settings.enabled,
      };
    }
  }

  return (
    <main className="gb-page gb-page-pad min-h-screen bg-black text-foreground">
      <StickyBookCta />
      <section className="mx-auto max-w-4xl px-4 pt-28 pb-12 sm:px-6">
        <PremiumEyebrow>Refer & earn</PremiumEyebrow>
        <h1 className="mt-4 text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">
          Share Gloss Boss. <span className="text-gold-soft">Get rewarded.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Friends save on their first detail. You unlock real rewards when they book and complete — tracked automatically.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <PremiumButton href="/book">Book a detail</PremiumButton>
          {!session.user ? <PremiumButton href="/login" variant="secondary">Sign in for your link</PremiumButton> : null}
        </div>
      </section>

      {referralProps ? (
        <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
          <CustomerReferralCard {...referralProps} />
        </section>
      ) : (
        <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
          <div className="rounded-3xl border border-dashed border-gold/30 bg-gold/5 p-8 text-center">
            <p className="text-sm text-zinc-300">Sign in after your first booking to unlock your referral link, QR code, and reward progress.</p>
            <Link href="/login" className="mt-4 inline-block text-[10px] font-black uppercase text-gold-soft underline">
              Go to login →
            </Link>
          </div>
        </section>
      )}

      <section className="border-t border-white/5 bg-zinc-950/80 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-xl font-black uppercase text-white">Reward ladder</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              ['1 referral', 'Free add-on'],
              ['3 referrals', 'Interior upgrade'],
              ['5 referrals', 'Free maintenance wash'],
              ['10 referrals', 'Free full detail'],
            ].map(([n, reward]) => (
              <li key={n} className="rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-sm">
                <span className="font-black text-gold-soft">{n}</span>
                <span className="text-zinc-400"> → {reward}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { canAccessCustomerPortal } from '@/lib/auth/customer-portal';
import { resolveAuthenticatedCustomer } from '@/lib/customer-account';
import {
  ensureCustomerReferralCode,
  formatReferralTerms,
  formatReferredReward,
  formatReferrerReward,
  loadReferralProgramSettings,
  referralLinkForCode,
} from '@/lib/referral/referral-codes';
import { loadReferralStatsForCustomer } from '@/lib/referral/referral-events';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionWithProfile();
  const email = session.user?.email?.trim().toLowerCase() ?? '';
  if (!session.user?.id || !email || !canAccessCustomerPortal(session.profile?.role)) {
    return NextResponse.json({ error: 'Sign in to view referrals.' }, { status: 401 });
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Referrals are temporarily unavailable.' }, { status: 503 });
  const customer = await resolveAuthenticatedCustomer(admin, {
    authUserId: session.user.id,
    email,
    fullName: session.profile?.full_name,
  });
  if (!customer?.id) return NextResponse.json({ error: 'Your customer profile could not be loaded.' }, { status: 409 });
  try {
    const [code, settings, stats] = await Promise.all([
      ensureCustomerReferralCode(admin, customer.id),
      loadReferralProgramSettings(admin),
      loadReferralStatsForCustomer(admin, customer.id),
    ]);
    return NextResponse.json({
      ok: true,
      referral: {
        code: code.code,
        link: referralLinkForCode(code.code),
        enabled: settings.enabled,
        giveLabel: formatReferredReward(settings),
        getLabel: formatReferrerReward(settings),
        terms: formatReferralTerms(settings),
        threshold: settings.freeDetailReferralThreshold,
        rewardLadder: settings.rewardLadder,
        stats,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Your referrals could not be loaded. Please try again.' }, { status: 500 });
  }
}

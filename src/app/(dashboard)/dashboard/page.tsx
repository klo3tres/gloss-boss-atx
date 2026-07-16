import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { CustomerDashboardClient } from '@/components/dashboard/customer-dashboard-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import {
  loadCustomerSnapshotForAppointment,
  type CustomerApptSnapshotView,
} from '@/lib/customer-dashboard-snapshot';
import { calculateLoyaltyStatus } from '@/lib/loyalty-ledger';
import { buildLoyaltyRewardView, loadLoyaltyRewardConfig, loadLoyaltyRewardState } from '@/lib/loyalty-reward-claim';



export const dynamic = 'force-dynamic';



type ApptRow = {

  id: string;

  status: string;

  scheduled_start: string;

  service_slug: string;

  vehicle_class: string;

  base_price_cents: number;

  deposit_amount_cents: number;

  job_started_at: string | null;

  job_completed_at: string | null;
  booking_vehicles?: unknown;
  service_address?: string | null;
  service_city?: string | null;
  service_state?: string | null;
  service_zip?: string | null;
  balance_due_cents?: number | null;
  payment_status?: string | null;
  guest_email?: string | null;

};



type TimelineRow = {

  appointment_id: string;

  event_type: string;

  created_at: string;

  meta: Record<string, unknown> | null;

};



type MediaRow = {

  appointment_id: string;

  file_url: string;

  category: string;

  visible_to_customer: boolean | null;

};

type PaymentRow = {
  appointment_id: string;
  amount_cents: number;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
};

type ReceiptRow = {
  appointment_id: string;
  receipt_number: string | null;
  amount_cents: number;
  payment_method: string | null;
  created_at: string;
};

type AgreementRow = {
  id: string;
  appointment_id: string;
  signed_at: string | null;
};

type CustomerMembershipView = {
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

type ActiveDealView = {
  id: string;
  title: string;
  description: string;
  discount: string;
};



function friendlyEventLabel(t: string): string {

  return t.replace(/_/g, ' ');

}

function chicago(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch {
      return value.split('\n').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

async function loadActiveCustomerMembership(adminDb: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>, customerId: string): Promise<CustomerMembershipView | null> {
  const baseSelect =
    'id, membership_plan_id, status, ends_at, current_period_end, credit_balance_cents, billing_interval';
  let membershipRes = await adminDb
    .from('customer_memberships')
    .select(baseSelect)
    .eq('customer_id', customerId)
    .in('status', ['active', 'trialing', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipRes.error) {
    membershipRes = await adminDb
      .from('customer_memberships')
      .select('id, membership_plan_id, status, ends_at')
      .eq('customer_id', customerId)
      .in('status', ['active', 'trialing', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  const membership = membershipRes.data as Record<string, unknown> | null;
  if (!membership?.membership_plan_id) return null;

  const planRes = await adminDb
    .from('membership_plans')
    .select('id, name, tier, price_cents, billing_interval, discount_percent, benefits, included_services')
    .eq('id', String(membership.membership_plan_id))
    .maybeSingle();
  const plan = (planRes.data ?? {}) as Record<string, unknown>;

  return {
    status: String(membership.status ?? 'active'),
    tier: String(plan.tier ?? 'member'),
    name: String(plan.name ?? 'Gloss Boss Membership'),
    billingInterval: String(membership.billing_interval ?? plan.billing_interval ?? 'monthly'),
    priceCents: typeof plan.price_cents === 'number' ? plan.price_cents : 0,
    discountPercent: typeof plan.discount_percent === 'number' ? plan.discount_percent : 0,
    creditBalanceCents: typeof membership.credit_balance_cents === 'number' ? membership.credit_balance_cents : 0,
    currentPeriodEnd: typeof membership.current_period_end === 'string' ? membership.current_period_end : null,
    endsAt: typeof membership.ends_at === 'string' ? membership.ends_at : null,
    benefits: toStringList(plan.benefits),
    includedServices: toStringList(plan.included_services),
  };
}

async function loadCustomerDeals(adminDb: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>): Promise<ActiveDealView[]> {
  const now = new Date().toISOString();
  const { data, error } = await adminDb
    .from('promo_codes')
    .select('id, code, description, discount_type, discount_value, enabled, starts_at, ends_at, archived_at')
    .eq('enabled', true)
    .is('archived_at', null)
    .limit(8);
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => {
      const starts = typeof row.starts_at === 'string' ? row.starts_at : '';
      const ends = typeof row.ends_at === 'string' ? row.ends_at : '';
      return (!starts || starts <= now) && (!ends || ends >= now);
    })
    .map((row) => {
      const type = String(row.discount_type ?? 'percent');
      const value = Number(row.discount_value ?? 0);
      const discount = type === 'amount' ? `$${value.toFixed(2)} off` : type === 'comp' ? 'Free/comp offer' : `${value}% off`;
      return {
        id: String(row.id),
        title: String(row.code ?? 'Member offer'),
        description: String(row.description ?? 'Active Gloss Boss promotion'),
        discount,
      };
    });
}



export default async function CustomerDashboardRootPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const sp = await searchParams;
  const highlightJobId = typeof sp.job === 'string' ? sp.job.trim() : '';

  const session = await getSessionWithProfile();

  const supabase = await createSupabaseServerClient();
  const adminDb = tryCreateAdminSupabase();



  let appointments: ApptRow[] = [];

  const eventsByAppt = new Map<string, TimelineRow[]>();

  const photosByAppt = new Map<string, MediaRow[]>();
  const paymentsByAppt = new Map<string, PaymentRow[]>();
  const receiptsByAppt = new Map<string, ReceiptRow[]>();
  const agreementByAppt = new Map<string, AgreementRow>();



  const userEmail = session.user?.email?.trim().toLowerCase() ?? '';
  let referralCode: string | null = null;
  let referralLink: string | null = null;
  let referralCompletedCount = 0;
  let referralBookedCount = 0;
  let referralSentCount = 0;
  let referralRewardsEarned = 0;
  let referralRewardsAvailable = 0;
  let referralProgramEnabled = true;
  let referralRewardRules = '';
  let referralGiveLabel = '';
  let referralGetLabel = '';
  let referralFreeDetailThreshold = 5;
  let referralPendingCount = 0;
  let referralGivePercent = 10;
  let referralGetPercent = 20;
  let referralRewardLadder: import('@/lib/referral/referral-codes').ReferralRewardLadderTier[] = [];

  if (supabase && session.user && userEmail) {
    let customerId = '';
    if (adminDb) {
      const { data: cust } = await adminDb.from('customers').select('id').ilike('email', userEmail).maybeSingle();
      customerId = cust?.id ? String(cust.id) : '';
      if (customerId) {
        const { ensureCustomerReferralCode, loadReferralProgramSettings, referralLinkForCode } = await import('@/lib/referral/referral-codes');
        const settings = await loadReferralProgramSettings(adminDb);
        referralProgramEnabled = settings.enabled;
        referralFreeDetailThreshold = settings.freeDetailReferralThreshold;
        referralGivePercent = settings.referredRewardValue;
        referralGetPercent = settings.referrerRewardValue;
        referralRewardLadder = settings.rewardLadder ?? [];
        const { formatReferralTerms, formatReferredReward, formatReferrerReward } = await import('@/lib/referral/referral-codes');
        referralRewardRules = formatReferralTerms(settings);
        referralGiveLabel = formatReferredReward(settings);
        referralGetLabel = formatReferrerReward(settings);
        const codeRow = await ensureCustomerReferralCode(adminDb, customerId);
        referralCode = codeRow.code;
        referralLink = referralLinkForCode(codeRow.code);
        const { loadReferralStatsForCustomer } = await import('@/lib/referral/referral-events');
        const stats = await loadReferralStatsForCustomer(adminDb, customerId);
        referralSentCount = stats.sent;
        referralBookedCount = stats.booked;
        referralCompletedCount = stats.completed;
        referralPendingCount = stats.pending;
        referralRewardsEarned = stats.rewardsEarned;
        referralRewardsAvailable = stats.rewardsAvailable;
      }
    }

    let query = supabase
      .from('appointments')
      .select(
        'id, status, scheduled_start, service_slug, vehicle_class, booking_vehicles, service_address, service_city, service_state, service_zip, base_price_cents, deposit_amount_cents, balance_due_cents, payment_status, job_started_at, job_completed_at, guest_email',
      )
      .order('scheduled_start', { ascending: false })
      .limit(40);

    if (customerId) {
      query = query.or(`guest_email.eq.${userEmail},customer_id.eq.${customerId}`);
    } else {
      query = query.eq('guest_email', userEmail);
    }

    const { data } = await query;
    appointments = (data ?? []) as ApptRow[];



    const ids = appointments.map((a) => a.id);

    if (ids.length > 0) {

      const [evRes, medRes, payRes, agRes, receiptRes] = await Promise.all([

        supabase

          .from('job_timeline_events')

          .select('appointment_id, event_type, created_at, meta')

          .in('appointment_id', ids)

          .order('created_at', { ascending: false })

          .limit(400),

        supabase

          .from('job_media')

          .select('appointment_id, file_url, category, visible_to_customer')

          .in('appointment_id', ids)

          .order('created_at', { ascending: false })

          .limit(200),
        supabase
          .from('payments')
          .select('appointment_id, amount_cents, status, payment_method, paid_at')
          .in('appointment_id', ids)
          .order('paid_at', { ascending: false })
          .limit(100),
        supabase
          .from('signed_agreements')
          .select('id, appointment_id, signed_at')
          .in('appointment_id', ids)
          .order('signed_at', { ascending: false })
          .limit(100),
        supabase
          .from('receipts')
          .select('appointment_id, receipt_number, amount_cents, payment_method, created_at')
          .in('appointment_id', ids)
          .order('created_at', { ascending: false })
          .limit(100),

      ]);



      for (const row of (evRes.data ?? []) as TimelineRow[]) {

        const list = eventsByAppt.get(row.appointment_id) ?? [];

        if (list.length < 12) list.push(row);

        eventsByAppt.set(row.appointment_id, list);

      }



      for (const row of (medRes.data ?? []) as MediaRow[]) {

        if (!row.visible_to_customer) continue;

        const list = photosByAppt.get(row.appointment_id) ?? [];

        if (list.length < 8) list.push(row);

        photosByAppt.set(row.appointment_id, list);

      }

      for (const row of (payRes.data ?? []) as PaymentRow[]) {
        const list = paymentsByAppt.get(row.appointment_id) ?? [];
        list.push(row);
        paymentsByAppt.set(row.appointment_id, list);
      }

      for (const row of (agRes.data ?? []) as AgreementRow[]) {
        if (!agreementByAppt.has(row.appointment_id)) agreementByAppt.set(row.appointment_id, row);
      }

      for (const row of (receiptRes.data ?? []) as ReceiptRow[]) {
        const list = receiptsByAppt.get(row.appointment_id) ?? [];
        list.push(row);
        receiptsByAppt.set(row.appointment_id, list);
      }

    }

  }



  const now = Date.now();
  const history = appointments.filter((a) => ['completed', 'cancelled'].includes(a.status)).slice(0, 12);
  let reviewEligible = false;
  const completedAppointments = appointments.filter((a) => a.status === 'completed');
  if (adminDb && userEmail && completedAppointments.length > 0) {
    const reviewed = await adminDb.from('customer_reviews').select('id').or(`customer_email.ilike.${userEmail},appointment_id.in.(${completedAppointments.map((a) => a.id).join(',')})`).limit(1);
    reviewEligible = !reviewed.error && (reviewed.data?.length ?? 0) === 0;
  }
  const inFlight = appointments.filter(
    (a) => !['completed', 'cancelled'].includes(a.status) && (a.status === 'in_progress' || (a.job_started_at && !a.job_completed_at)),
  );
  const pending = appointments.filter(
    (a) =>
      !['completed', 'cancelled', 'in_progress'].includes(a.status) &&
      !a.job_started_at &&
      ['awaiting_payment', 'pending', 'assigned', 'deposit_paid', 'confirmed'].includes(a.status),
  );
  const upcoming = appointments
    .filter((a) => !['completed', 'cancelled'].includes(a.status) && new Date(a.scheduled_start).getTime() >= now - 3600000)
    .filter((a) => !inFlight.some((j) => j.id === a.id))
    .slice(0, 8);

  const liveJob = inFlight[0] ?? upcoming.find((a) => a.status === 'in_progress' || (a.job_started_at && !a.job_completed_at)) ?? null;



  const liveEvents = liveJob ? eventsByAppt.get(liveJob.id) ?? [] : [];
  let vehicleTotal = appointments.reduce((sum, a) => sum + (Array.isArray(a.booking_vehicles) ? a.booking_vehicles.length : 1), 0);
  let loyaltyRewardThreshold = 5;
  let loyaltyStampsCount = 0;
  let loyaltyCanClaim = false;
  let loyaltyClaimableCount = 0;
  let loyaltyRewardDescription = '';
  let loyaltyRewardCents = 0;
  let loyaltyRewardType = 'credit';
  let loyaltyEligibleServices: Array<{ slug: string; name: string; priceCents: number }> = [];
  let customerMembership: CustomerMembershipView | null = null;
  let accountCreditBalanceCents = 0;
  let rewardWalletItems: import('@/components/customer/customer-reward-wallet').CustomerRewardWalletItem[] = [];
  let activeDeals: ActiveDealView[] = [];
  let activeCardDesign = null;
  if (adminDb && userEmail) {
    const { data: cust } = await adminDb.from('customers').select('id').ilike('email', userEmail).maybeSingle();
    if (cust?.id) {
      const [{ count }, { data: stamps }] = await Promise.all([
        adminDb.from('vehicles').select('id', { count: 'exact', head: true }).eq('customer_id', cust.id),
        adminDb.from('loyalty_stamps').select('stamp_count, voided, voided_at').eq('customer_id', cust.id),
      ]);
      if (typeof count === 'number' && count > 0) vehicleTotal = count;
      const rewardConfig = await loadLoyaltyRewardConfig(adminDb);
      loyaltyRewardThreshold = rewardConfig.rewardThreshold;
      loyaltyStampsCount = calculateLoyaltyStatus(stamps ?? [], { rewardThreshold: rewardConfig.rewardThreshold }).totalStamps;
      const rewardState = await loadLoyaltyRewardState(adminDb, String(cust.id));
      const loyaltyView = buildLoyaltyRewardView(stamps ?? [], rewardState.issuedRewards, {
        rewardThreshold: rewardConfig.rewardThreshold,
        redeemedRewards: rewardState.redeemedRewards,
        consumedStamps: rewardState.consumedStamps,
        resetBehavior: rewardConfig.resetBehavior,
        tierThresholds: rewardConfig.tierThresholds,
      });
      loyaltyCanClaim = loyaltyView.canClaim;
      loyaltyClaimableCount = loyaltyView.claimableRewards;
      loyaltyRewardDescription = rewardConfig.rewardDescription;
      loyaltyRewardCents = rewardConfig.rewardCents;
      loyaltyRewardType = rewardConfig.rewardType;
      if (['free_service', 'free_wash'].includes(rewardConfig.rewardType)) {
        const serviceRows = await adminDb.from('services').select('id, slug, name, base_price_cents').eq('active', true).order('sort_order', { ascending: true });
        const allowed = new Set(rewardConfig.eligibleServiceSlugs.length > 0 ? rewardConfig.eligibleServiceSlugs : rewardConfig.freeServiceSlug ? [rewardConfig.freeServiceSlug] : []);
        loyaltyEligibleServices = (serviceRows.data ?? [])
          .filter((service) => allowed.size === 0 || allowed.has(String(service.slug)))
          .map((service) => ({ slug: String(service.slug), name: String(service.name), priceCents: Number(service.base_price_cents ?? 0) }));
      }
      customerMembership = await loadActiveCustomerMembership(adminDb, String(cust.id));
      const creditRes = await adminDb
        .from('customer_credits')
        .select('id, amount_cents, remaining_cents, type, reason, source, status, expires_at, redeemed_at')
        .eq('customer_id', cust.id)
        .order('issued_at', { ascending: false })
        .limit(500);
      if (!creditRes.error) {
        const nowIso = new Date().toISOString();
        accountCreditBalanceCents = (creditRes.data ?? []).reduce((sum, row) => {
          if (!['active', 'partially_used'].includes(String(row.status))) return sum;
          const expiresAt = typeof row.expires_at === 'string' ? row.expires_at : '';
          if (expiresAt && expiresAt < nowIso) return sum;
          return sum + (typeof row.remaining_cents === 'number' ? Math.max(0, row.remaining_cents) : 0);
        }, 0);
        rewardWalletItems = (creditRes.data ?? []).map((row) => {
          const status = String(row.status ?? 'active');
          const expired = Boolean(row.expires_at && String(row.expires_at) < nowIso);
          const usable = ['active', 'partially_used'].includes(status) && !expired && Number(row.remaining_cents ?? 0) > 0;
          return {
            id: `credit:${row.id}`,
            source: String(row.type ?? row.source ?? 'Account credit').replace(/_/g, ' '),
            title: String(row.reason ?? 'Gloss Boss credit'),
            valueLabel: `$${(Math.max(0, Number(row.remaining_cents ?? row.amount_cents ?? 0)) / 100).toFixed(2)}`,
            status: expired ? 'expired' : status,
            expiresAt: row.expires_at ? String(row.expires_at) : null,
            usable,
            terms: usable ? 'Choose how much credit to apply during booking. One-time balance; any remainder stays in your wallet.' : null,
          };
        });
      }
      const referralWallet = await adminDb.from('referral_rewards').select('id, reward_type, reward_value, reward_label, status, expires_at, metadata, eligibility, selected_service_slug, selected_addon_slug, reserved_appointment_id').eq('customer_id', cust.id).in('reward_type', ['percent', 'free_addon', 'free_service', 'custom']).order('created_at', { ascending: false }).limit(100);
      if (!referralWallet.error) {
        const { formatRewardSummary } = await import('@/lib/referral/referral-codes');
        rewardWalletItems.push(...(referralWallet.data ?? []).map((row) => {
          const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
          const expiresAt = row.expires_at ? String(row.expires_at) : typeof metadata.expires_at === 'string' ? metadata.expires_at : null;
          const expired = Boolean(expiresAt && expiresAt < new Date().toISOString());
          const status = expired ? 'expired' : String(row.status ?? 'pending');
          const eligibility = row.eligibility && typeof row.eligibility === 'object' ? row.eligibility as Record<string, unknown> : {};
          const serviceTerms = Array.isArray(eligibility.eligibleServiceSlugs) ? eligibility.eligibleServiceSlugs.map(String) : [];
          const addonTerms = Array.isArray(eligibility.eligibleAddonSlugs) ? eligibility.eligibleAddonSlugs.map(String) : [];
          const vehicleTerms = Array.isArray(eligibility.vehicleRestrictions) ? eligibility.vehicleRestrictions.map(String) : [];
          const terms = [
            serviceTerms.length ? `Services: ${serviceTerms.join(', ')}` : '',
            addonTerms.length ? `Add-ons: ${addonTerms.join(', ')}` : '',
            vehicleTerms.length ? `Vehicles: ${vehicleTerms.join(', ')}` : '',
            eligibility.maximumRetailCents ? `Maximum value: $${(Number(eligibility.maximumRetailCents) / 100).toFixed(2)}` : '',
            eligibility.customerPaysDifference === true ? 'You pay any difference.' : '',
          ].filter(Boolean).join(' · ');
          return {
            id: `referral:${row.id}`,
            source: 'Referral reward',
            title: String(row.reward_label ?? formatRewardSummary(String(row.reward_type), Number(row.reward_value ?? 0))),
            valueLabel: formatRewardSummary(String(row.reward_type), Number(row.reward_value ?? 0)),
            status,
            expiresAt,
            usable: ['issued', 'available'].includes(status),
            terms: `${terms ? `${terms} ` : ''}Selection is confirmed during booking. One-time use.`,
            bookingHref: `/book?reward=${encodeURIComponent(String(row.id))}`,
          };
        }));
      }
      activeDeals = await loadCustomerDeals(adminDb);

      const tier = (customerMembership?.tier || 'default').toLowerCase();
      const { data: design } = await adminDb
        .from('loyalty_card_designs')
        .select('*')
        .eq('tier', tier)
        .eq('active', true)
        .eq('archived', false)
        .maybeSingle();
      activeCardDesign = design;

      if (!activeCardDesign && tier !== 'default') {
        const { data: defaultDesign } = await adminDb
          .from('loyalty_card_designs')
          .select('*')
          .eq('tier', 'default')
          .eq('active', true)
          .eq('archived', false)
          .maybeSingle();
        activeCardDesign = defaultDesign;
      }

      if (activeCardDesign) {
        activeCardDesign = {
          ...(activeCardDesign as Record<string, unknown>),
          tier: customerMembership?.tier || (activeCardDesign as Record<string, unknown>).tier || 'member',
          name: customerMembership?.name || (activeCardDesign as Record<string, unknown>).name || 'Gloss Boss Loyalty Card',
        };
      }
    }
  }
  const receiptTotal = Array.from(receiptsByAppt.values()).reduce((sum, rows) => sum + rows.length, 0) || Array.from(paymentsByAppt.values()).reduce((sum, rows) => sum + rows.length, 0);
  const photoTotal = Array.from(photosByAppt.values()).reduce((sum, rows) => sum + rows.length, 0);
  const agreementTotal = agreementByAppt.size;

  const mapToRecord = <T,>(m: Map<string, T[]>) => {
    const o: Record<string, T[]> = {};
    m.forEach((v, k) => {
      o[k] = v;
    });
    return o;
  };
  const agreementRecord: Record<string, boolean> = {};
  const agreementHrefByAppt: Record<string, string> = {};
  agreementByAppt.forEach((row, k) => {
    agreementRecord[k] = true;
    agreementHrefByAppt[k] = `/dashboard/agreements/${encodeURIComponent(`signed_agreements:${row.id}`)}`;
  });

  const snapshotByAppt: Record<string, CustomerApptSnapshotView> = {};
  if (adminDb && appointments.length > 0) {
    const snaps = await Promise.all(
      appointments.map(async (a) => {
        const snap = await loadCustomerSnapshotForAppointment(adminDb, a.id);
        return snap ? ([a.id, snap] as const) : null;
      }),
    );
    for (const row of snaps) {
      if (row) snapshotByAppt[row[0]] = row[1];
    }
  }

  const { resolveGoogleReviewUrl } = await import('@/lib/site-defaults');
  let googleReviewUrl = '';
  if (adminDb) {
    const ss = await adminDb.from('site_settings').select('value').eq('key', 'google_review_url').maybeSingle();
    const raw = ss.data?.value;
    if (typeof raw === 'string' && raw.startsWith('http')) googleReviewUrl = raw.trim();
    else if (raw && typeof raw === 'object') {
      const o = raw as { url?: unknown; review_url?: unknown };
      const u = o.review_url ?? o.url;
      if (typeof u === 'string' && u.startsWith('http')) googleReviewUrl = u.trim();
    }
    if (!googleReviewUrl) {
      const gb = await adminDb.from('site_settings').select('value').eq('key', 'google_business').maybeSingle();
      const rv = gb.data?.value;
      if (rv && typeof rv === 'object' && 'review_url' in (rv as object)) {
        const u = (rv as { review_url?: unknown }).review_url;
        if (typeof u === 'string') googleReviewUrl = u.trim();
      }
    }
  }

  let weatherForecast = null;
  let weatherLocationLabel = process.env.BUSINESS_HOME_BASE_ADDRESS?.trim() || 'Austin service area';
  if (supabase && session.user && userEmail) {
    try {
      const { fetchWeatherForAddress } = await import('@/lib/weather-forecast');
      const nextAppt = upcoming[0];
      const apptAddress = nextAppt
        ? [nextAppt.service_address, nextAppt.service_city, nextAppt.service_state, nextAppt.service_zip].filter(Boolean).join(', ')
        : '';
      const weatherAddress = apptAddress || process.env.BUSINESS_HOME_BASE_ADDRESS?.trim() || 'Austin, TX';
      weatherLocationLabel = apptAddress ? 'At your next appointment' : weatherLocationLabel;
      weatherForecast = await fetchWeatherForAddress(weatherAddress);
    } catch (e) {
      console.error('[customer dashboard] weather forecast fetch error', e);
    }
  }

  return (
    <DashboardShell title='Your dashboard' subtitle='Garage, appointments, receipts, agreements, and live updates.' role='customer'>
      <CustomerDashboardClient
        googleReviewUrl={resolveGoogleReviewUrl(googleReviewUrl)}
        reviewEligible={reviewEligible}
        liveJob={liveJob ?? null}
        liveEvents={liveEvents}
        upcoming={upcoming}
        inFlight={inFlight}
        pending={pending}
        history={history}
        eventsByAppt={mapToRecord(eventsByAppt)}
        paymentsByAppt={mapToRecord(paymentsByAppt)}
        receiptsByAppt={mapToRecord(receiptsByAppt)}
        agreementByAppt={agreementRecord}
        agreementHrefByAppt={agreementHrefByAppt}
        photosByAppt={mapToRecord(photosByAppt)}
        vehicleTotal={vehicleTotal}
        receiptTotal={receiptTotal}
        photoTotal={photoTotal}
        agreementTotal={agreementTotal}
        appointmentCount={appointments.length}
        snapshotByAppt={snapshotByAppt}
        loyaltyStampsCount={loyaltyStampsCount}
      loyaltyRewardThreshold={loyaltyRewardThreshold}
        loyaltyCanClaim={loyaltyCanClaim}
        loyaltyClaimableCount={loyaltyClaimableCount}
        loyaltyRewardDescription={loyaltyRewardDescription}
        loyaltyRewardCents={loyaltyRewardCents}
        loyaltyRewardType={loyaltyRewardType}
        loyaltyEligibleServices={loyaltyEligibleServices}
        activeCardDesign={activeCardDesign}
        membership={customerMembership}
        accountCreditBalanceCents={accountCreditBalanceCents}
        rewardWalletItems={rewardWalletItems}
        activeDeals={activeDeals}
        weatherForecast={weatherForecast}
        weatherLocationLabel={weatherLocationLabel}
        referralCode={referralCode}
        referralLink={referralLink}
        referralCompletedCount={referralCompletedCount}
        referralBookedCount={referralBookedCount}
        referralSentCount={referralSentCount}
        referralRewardsEarned={referralRewardsEarned}
        referralRewardsAvailable={referralRewardsAvailable}
        referralProgramEnabled={referralProgramEnabled}
        referralRewardRules={referralRewardRules}
        referralGiveLabel={referralGiveLabel}
        referralGetLabel={referralGetLabel}
        referralFreeDetailThreshold={referralFreeDetailThreshold}
        referralPendingCount={referralPendingCount}
        referralGivePercent={referralGivePercent}
        referralGetPercent={referralGetPercent}
        referralRewardLadder={referralRewardLadder}
        highlightJobId={highlightJobId || undefined}
      />
    </DashboardShell>
  );
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadOrderSnapshot } from '@/lib/order-snapshot-engine';
import { isPortalAccessExpired } from '@/lib/customer-portal-access';
import { getStripeKeyHealth } from '@/lib/stripe/key-health';

function str(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function cents(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export type DiagnosticCheck = {
  key: string;
  label: string;
  status: 'pass' | 'warning' | 'fail';
  detail: string;
};

export type CustomerExperienceDiagnostics = {
  appointmentId: string;
  overall: 'Valid' | 'Recoverable' | 'Repair required';
  checks: DiagnosticCheck[];
  summary: {
    scheduledStart: string;
    status: string;
    finalTotalCents: number;
    discountCents: number;
    depositCents: number;
    depositPaidCents: number;
    totalPaidCents: number;
    acknowledgementCompleted: boolean;
    nextStep: 'inactive' | 'acknowledgement' | 'payment' | 'confirmation';
  };
  tracking: {
    createdAt: string | null;
    regeneratedAt: string | null;
    lastSentAt: string | null;
    smsDeliveredAt: string | null;
    emailDeliveredAt: string | null;
    firstOpenedAt: string | null;
    lastOpenedAt: string | null;
    openCount: number;
    acknowledgementStartedAt: string | null;
    acknowledgementCompletedAt: string | null;
    paymentPageOpenedAt: string | null;
    depositPaidAt: string | null;
    accountClaimStartedAt: string | null;
    accountCreatedAt: string | null;
    adminPreviewCount: number;
    automatedIgnoredCount: number;
  };
  rewards: {
    loyaltyPunches: number;
    activeCredits: number;
    reservedRewards: number;
    redeemedRewards: number;
    referralCodeReady: boolean;
  };
  timeline: Array<{
    id: string;
    type: string;
    at: string;
    bucket: 'customer' | 'admin' | 'automated' | 'system';
    counted: boolean;
    label: string;
  }>;
  canSafeRepairAccount: boolean;
};

export async function loadCustomerExperienceDiagnostics(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<CustomerExperienceDiagnostics | null> {
  const { data: appointment } = await admin
    .from('appointments')
    .select(
      'id, customer_id, access_token, status, scheduled_start, portal_access_expires_at, portal_link_revoked_at, portal_link_created_at, portal_link_last_regenerated_at, portal_link_last_sent_at, portal_link_first_opened_at, portal_link_last_opened_at, portal_link_open_count, acknowledgement_started_at, payment_page_opened_at, deposit_paid_at, account_claim_started_at, account_created_at, guest_email, customer_claimed_account_at',
    )
    .eq('id', appointmentId)
    .maybeSingle();
  if (!appointment) return null;

  const row = appointment as Record<string, unknown>;
  const customerId = str(row.customer_id);
  const token = str(row.access_token);
  const snapshot = await loadOrderSnapshot(admin, { appointmentId });
  const stripeHealth = await getStripeKeyHealth(admin);
  const identityEmail = str(row.guest_email || snapshot?.customer.email).toLowerCase();

  const [
    customerRes,
    agreementRes,
    duplicateCustomersRes,
    creditsRes,
    loyaltyRes,
    referralCodeRes,
    rewardsRes,
    portalEventsRes,
    outboxRes,
    calendarRes,
  ] = await Promise.all([
    customerId
      ? admin.from('customers').select('id, email, auth_user_id, portal_account_linked_at').eq('id', customerId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('signed_agreements').select('id, signed_at').eq('appointment_id', appointmentId).limit(1).maybeSingle(),
    identityEmail
      ? admin.from('customers').select('id').ilike('email', identityEmail)
      : Promise.resolve({ data: [] }),
    customerId
      ? admin.from('customer_credits').select('id, status, remaining_cents').eq('customer_id', customerId)
      : Promise.resolve({ data: [] }),
    customerId
      ? admin.from('loyalty_stamps').select('stamp_count, voided').eq('customer_id', customerId)
      : Promise.resolve({ data: [] }),
    customerId
      ? admin.from('customer_referral_codes').select('code').eq('customer_id', customerId).maybeSingle()
      : Promise.resolve({ data: null }),
    customerId
      ? admin.from('referral_rewards').select('id, status').eq('customer_id', customerId)
      : Promise.resolve({ data: [] }),
    admin
      .from('customer_portal_events')
      .select('id, event_type, occurred_at, admin_preview, bot_suspected, counted, metadata')
      .eq('appointment_id', appointmentId)
      .order('occurred_at', { ascending: false })
      .limit(80),
    admin
      .from('notification_outbox')
      .select('id, kind, channel, status, sent_at, created_at')
      .eq('appointment_id', appointmentId)
      .in('kind', ['booking_confirmation', 'deposit_request'])
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('google_calendar_sync_jobs')
      .select('provider_status, last_successful_sync_at')
      .eq('appointment_id', appointmentId)
      .maybeSingle(),
  ]);

  const customer = customerRes.data as Record<string, unknown> | null;
  const authUserId = str(customer?.auth_user_id);
  let linkedRole = '';
  let linkedEmail = '';
  if (authUserId) {
    const [{ data: profile }, authResult] = await Promise.all([
      admin.from('profiles').select('role').eq('id', authUserId).maybeSingle(),
      admin.auth.admin.getUserById(authUserId),
    ]);
    linkedRole = str((profile as Record<string, unknown> | null)?.role);
    linkedEmail = str(authResult.data.user?.email).toLowerCase();
  }

  const guestEmail = identityEmail;
  const customerEmail = str(customer?.email).toLowerCase();
  const staffLinked = ['super_admin', 'admin', 'dispatcher', 'technician', 'viewer'].includes(linkedRole);
  const accountMismatch = Boolean(
    staffLinked ||
      (authUserId && guestEmail && linkedEmail && guestEmail !== linkedEmail),
  );
  const duplicates = (duplicateCustomersRes.data ?? []) as Array<{ id?: string }>;
  const active = !['cancelled', 'voided', 'deleted'].includes(str(row.status).toLowerCase());
  const expired = isPortalAccessExpired(str(row.portal_access_expires_at));
  const revoked = Boolean(row.portal_link_revoked_at);
  const pricing = snapshot?.pricing;
  const depositRequired = cents(pricing?.depositCents) > 0;
  const depositPaid = cents(pricing?.depositPaidCents) >= cents(pricing?.depositCents) && depositRequired;
  const acknowledgementCompleted = Boolean(agreementRes.data || snapshot?.agreement.signed);
  const nextStep = !active
    ? 'inactive'
    : !acknowledgementCompleted
      ? 'acknowledgement'
      : depositRequired && !depositPaid
        ? 'payment'
        : 'confirmation';
  const knownDiscount =
    cents(pricing?.onlineDiscountCents) +
    cents(pricing?.multiCarDiscountCents) +
    cents(pricing?.promoDiscountCents) +
    cents(pricing?.manualDiscountCents);
  const discountCents = Math.max(
    knownDiscount,
    cents(pricing?.prePromoCents) - cents(pricing?.finalTotalCents),
  );

  const credits = (creditsRes.data ?? []) as Array<Record<string, unknown>>;
  const rewards = (rewardsRes.data ?? []) as Array<Record<string, unknown>>;
  const loyaltyPunches = ((loyaltyRes.data ?? []) as Array<Record<string, unknown>>).reduce(
    (sum, item) => sum + (item.voided ? 0 : Math.max(0, Number(item.stamp_count ?? 1))),
    0,
  );
  const checks: DiagnosticCheck[] = [
    { key: 'token', label: 'Secure token', status: token ? 'pass' : 'fail', detail: token ? 'Present and mapped to this work order.' : 'Missing.' },
    { key: 'active', label: 'Appointment active', status: active ? 'pass' : 'warning', detail: active ? 'Customer lifecycle is active.' : `Status is ${str(row.status) || 'inactive'}.` },
    { key: 'revoked', label: 'Link not revoked', status: revoked ? 'fail' : 'pass', detail: revoked ? 'Link was revoked.' : 'Not revoked.' },
    { key: 'expiry', label: 'Link expiry', status: expired ? 'warning' : 'pass', detail: expired ? 'Expired but recoverable by regeneration.' : 'Current.' },
    { key: 'confirmation', label: 'Confirmation route', status: token ? 'pass' : 'fail', detail: token ? 'Canonical state resolver is available.' : 'Cannot resolve without a token.' },
    { key: 'acknowledgement', label: 'Acknowledgement path', status: active && token ? 'pass' : 'warning', detail: acknowledgementCompleted ? 'Completed.' : 'Available; currently required.' },
    { key: 'payment', label: 'Deposit and payment state', status: pricing ? 'pass' : 'fail', detail: depositRequired ? `${depositPaid ? 'Deposit paid' : 'Deposit CTA required'}; next step ${nextStep}.` : 'No deposit required.' },
    { key: 'stripe', label: 'Stripe checkout readiness', status: stripeHealth.configured && !stripeHealth.mismatch ? 'pass' : 'warning', detail: stripeHealth.configured ? `${stripeHealth.secretMode || 'unknown'} mode${stripeHealth.mismatch ? ' with a key mismatch' : ' ready'}; payment source is the canonical order ledger.` : 'Stripe is not configured; booking remains recoverable.' },
    { key: 'account', label: 'Account claim readiness', status: accountMismatch ? 'fail' : duplicates.length > 1 ? 'warning' : 'pass', detail: accountMismatch ? 'Linked authentication account does not belong to this customer.' : duplicates.length > 1 ? 'Duplicate customer emails need review.' : authUserId ? 'Linked to a matching customer account.' : 'Ready to claim the existing customer record.' },
    { key: 'rewards', label: 'Loyalty, referral, and rewards', status: customerId ? 'pass' : 'warning', detail: customerId ? 'Wallet data resolves through the existing customer record.' : 'Booking needs a customer record before rewards can link.' },
    { key: 'calendar', label: 'Google Calendar sync', status: str(calendarRes.data?.provider_status) === 'synced' ? 'pass' : 'warning', detail: str(calendarRes.data?.provider_status).replace(/_/g, ' ') || 'No sync record.' },
  ];

  const portalEvents = ((portalEventsRes.data ?? []) as Array<Record<string, unknown>>).map((event) => {
    const adminPreview = Boolean(event.admin_preview);
    const automated = Boolean(event.bot_suspected);
    const counted = Boolean(event.counted);
    const bucket = adminPreview ? 'admin' : automated ? 'automated' : 'customer';
    return {
      id: str(event.id),
      type: str(event.event_type),
      at: str(event.occurred_at),
      bucket: bucket as 'customer' | 'admin' | 'automated',
      counted,
      label: str(event.event_type).replace(/_/g, ' '),
    };
  });
  const systemEvents = ((outboxRes.data ?? []) as Array<Record<string, unknown>>).map((event) => ({
    id: `outbox:${str(event.id)}`,
    type: str(event.kind),
    at: str(event.sent_at || event.created_at),
    bucket: 'system' as const,
    counted: true,
    label: `${str(event.kind).replace(/_/g, ' ')} · ${str(event.channel)} ${str(event.status)}`,
  }));
  const outboxRows = (outboxRes.data ?? []) as Array<Record<string, unknown>>;
  const deliveredAt = (channel: string) =>
    str(outboxRows.find((event) =>
      str(event.channel).toLowerCase() === channel &&
      ['delivered', 'sent'].includes(str(event.status).toLowerCase()),
    )?.sent_at || outboxRows.find((event) =>
      str(event.channel).toLowerCase() === channel &&
      ['delivered', 'sent'].includes(str(event.status).toLowerCase()),
    )?.created_at) || null;
  const lifecycleEvents = [
    row.portal_link_created_at ? { id: 'lifecycle:created', type: 'link_created', at: str(row.portal_link_created_at), bucket: 'system' as const, counted: true, label: 'secure link created' } : null,
    agreementRes.data?.signed_at ? { id: 'lifecycle:ack', type: 'acknowledgement_completed', at: str(agreementRes.data.signed_at), bucket: 'customer' as const, counted: true, label: 'acknowledgement completed' } : null,
    row.deposit_paid_at ? { id: 'lifecycle:deposit', type: 'deposit_paid', at: str(row.deposit_paid_at), bucket: 'customer' as const, counted: true, label: 'deposit paid' } : null,
    row.account_created_at ? { id: 'lifecycle:account', type: 'account_created', at: str(row.account_created_at), bucket: 'customer' as const, counted: true, label: 'account created' } : null,
  ].filter((event): event is NonNullable<typeof event> => Boolean(event));
  const timeline = [...portalEvents, ...systemEvents, ...lifecycleEvents].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
  const hasFail = checks.some((check) => check.status === 'fail');
  const hasWarning = checks.some((check) => check.status === 'warning');
  const overall = hasFail ? 'Repair required' : hasWarning ? 'Recoverable' : 'Valid';
  return {
    appointmentId,
    overall,
    checks,
    summary: {
      scheduledStart: str(row.scheduled_start),
      status: str(row.status),
      finalTotalCents: cents(pricing?.finalTotalCents),
      discountCents,
      depositCents: cents(pricing?.depositCents),
      depositPaidCents: cents(pricing?.depositPaidCents),
      totalPaidCents: cents(pricing?.totalPaidCents),
      acknowledgementCompleted,
      nextStep,
    },
    tracking: {
      createdAt: str(row.portal_link_created_at) || null,
      regeneratedAt: str(row.portal_link_last_regenerated_at) || null,
      lastSentAt: str(row.portal_link_last_sent_at) || null,
      smsDeliveredAt: deliveredAt('sms'),
      emailDeliveredAt: deliveredAt('email'),
      firstOpenedAt: str(row.portal_link_first_opened_at) || null,
      lastOpenedAt: str(row.portal_link_last_opened_at) || null,
      openCount: Number(row.portal_link_open_count ?? 0),
      acknowledgementStartedAt: str(row.acknowledgement_started_at) || null,
      acknowledgementCompletedAt: str(agreementRes.data?.signed_at) || null,
      paymentPageOpenedAt: str(row.payment_page_opened_at) || null,
      depositPaidAt: str(row.deposit_paid_at) || null,
      accountClaimStartedAt: str(row.account_claim_started_at) || null,
      accountCreatedAt: str(row.account_created_at) || null,
      adminPreviewCount: portalEvents.filter((event) => event.bucket === 'admin').length,
      automatedIgnoredCount: portalEvents.filter((event) => event.bucket === 'automated' && !event.counted).length,
    },
    rewards: {
      loyaltyPunches,
      activeCredits: credits.filter((item) => ['active', 'partially_used'].includes(str(item.status))).length,
      reservedRewards: rewards.filter((item) => ['pending', 'issued', 'available'].includes(str(item.status))).length,
      redeemedRewards: rewards.filter((item) => str(item.status) === 'redeemed').length,
      referralCodeReady: Boolean(referralCodeRes.data?.code),
    },
    timeline,
    canSafeRepairAccount: accountMismatch && staffLinked,
  };
}

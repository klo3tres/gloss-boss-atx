import type { SupabaseClient } from '@supabase/supabase-js';
import {
  businessNotifyDestination,
  getResendEnvStatus,
  resendConfigured,
  twilioConfigured,
} from '@/lib/email-send';
import { businessNotifyPhone } from '@/lib/business-booking-notify';
import {
  classifyOpenBalance,
  classifyPendingDeposit,
  isActionableOpenBalance,
  isStaleOpenBalance,
  isStalePendingDeposit,
  type OpenBalanceAppt,
} from '@/lib/open-balance-filters';
import { findDuplicatePaymentGroups } from '@/lib/payment-duplicate-repair';
import { shouldExcludeFromCashRevenue, isRealStripePayment } from '@/lib/payment-classification';
import {
  fetchPaymentsSince,
  startOfTodayIso,
  startOfWeekIso,
  summarizePayments,
  type PayRow,
} from '@/lib/revenue-metrics';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { isTestLikeJob } from '@/lib/tech-job-filters';
import { loadDismissedFingerprints, syncBusinessExceptions } from '@/lib/business-exception-sync';
import { assessBeforePhotoSlots } from '@/lib/pre-inspection';
import { fetchWeatherForAddress, type WeatherSnapshot } from '@/lib/weather-forecast';
import { workOrderPath } from '@/lib/work-order-links';
import {
  dateKeyChicago,
  endOfTodayChicagoIso,
  isTodayChicago,
  isTomorrowChicago,
  startOfTodayChicagoIso,
} from '@/lib/chicago-time';

export type ExceptionCategory =
  | 'payments'
  | 'work_orders'
  | 'agreements'
  | 'notifications'
  | 'weather'
  | 'photos'
  | 'customers'
  | 'leads'
  | 'system';

export type ExceptionSeverity = 'critical' | 'warning' | 'info';

export type ExceptionInlineActionType =
  | 'repair_duplicates'
  | 'exclude_payment'
  | 'retry_notification'
  | 'dismiss'
  | 'send_followup'
  | 'create_offer';

export type ExceptionInlineAction = {
  type: ExceptionInlineActionType;
  label: string;
  paymentId?: string;
  outboxId?: string;
  winnerId?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerId?: string;
};

export type OperationException = {
  id: string;
  category: ExceptionCategory;
  severity: ExceptionSeverity;
  title: string;
  detail: string;
  customerName?: string | null;
  workOrderId?: string | null;
  paymentId?: string | null;
  receiptId?: string | null;
  outboxId?: string | null;
  occurredAt: string | null;
  href: string;
  actionLabel: string;
  secondaryHref?: string;
  secondaryActionLabel?: string;
  channel?: string | null;
  recipient?: string | null;
  eventType?: string | null;
  suggestedNext?: string;
  inlineActions?: ExceptionInlineAction[];
};

export type ExceptionSummary = {
  critical: number;
  warning: number;
  info: number;
  total: number;
  jobsRequiringAction: number;
  moneyRequiringActionCents: number;
  communicationIssues: number;
  byCategory: Record<ExceptionCategory, number>;
};

export type DailyJobRow = {
  id: string;
  guestName: string;
  time: string;
  scheduledStart: string;
  status: string;
  service: string;
  techName: string;
  href: string;
  hasAddress: boolean;
  hasContact: boolean;
  hasAgreement: boolean;
  hasBeforePhotos: boolean;
  hasAfterPhotos: boolean;
  balanceDueCents: number;
  basePriceCents: number;
};

export type DailyOperationsBoard = {
  refreshedAt: string;
  today: {
    jobCount: number;
    jobs: DailyJobRow[];
    missingTech: number;
    missingAddress: number;
    missingAgreement: number;
    missingBeforePhotos: number;
    missingAfterPhotos: number;
    techniciansAssigned: number;
    weatherRisk: boolean;
    weatherNote: string | null;
    projectedRevenueCents: number;
    collectedCents: number;
    unpaidCompletedCents: number;
    unpaidCompletedCount: number;
  };
  tomorrow: {
    jobCount: number;
    jobs: DailyJobRow[];
    unassigned: number;
    weatherRisk: boolean;
    weatherNote: string | null;
    prepChecklist: string[];
  };
  week: {
    scheduledJobs: number;
    expectedRevenueCents: number;
    completedJobs: number;
    openReceivablesCents: number;
    followUpsDue: number;
  };
  revenueTodayCents: number;
  revenueWeekCents: number;
};

export type OperationsSnapshot = {
  refreshedAt: string;
  exceptions: OperationException[];
  summary: ExceptionSummary;
  dailyOps: DailyOperationsBoard;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function woHref(id: string) {
  return workOrderPath(id, { source: 'appointment', shell: 'admin' });
}

function summarizeExceptions(items: OperationException[]): ExceptionSummary {
  const byCategory: Record<ExceptionCategory, number> = {
    payments: 0,
    work_orders: 0,
    agreements: 0,
    notifications: 0,
    weather: 0,
    photos: 0,
    customers: 0,
    leads: 0,
    system: 0,
  };
  let critical = 0;
  let warning = 0;
  let info = 0;
  let jobsRequiringAction = 0;
  let moneyRequiringActionCents = 0;
  let communicationIssues = 0;

  for (const item of items) {
    byCategory[item.category] += 1;
    if (item.severity === 'critical') critical += 1;
    else if (item.severity === 'warning') warning += 1;
    else info += 1;
    if (item.category === 'work_orders' && item.workOrderId) jobsRequiringAction += 1;
    if (item.category === 'payments' && item.detail.includes('$')) {
      const m = item.detail.match(/\$([0-9,]+\.[0-9]{2})/);
      if (m) moneyRequiringActionCents += Math.round(parseFloat(m[1].replace(/,/g, '')) * 100);
    }
    if (item.category === 'notifications') communicationIssues += 1;
  }

  return {
    critical,
    warning,
    info,
    total: items.length,
    jobsRequiringAction,
    moneyRequiringActionCents,
    communicationIssues,
    byCategory,
  };
}

function chicagoShort(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

type ApptRow = Record<string, unknown>;

function buildDailyJobRow(
  row: ApptRow,
  techNames: Map<string, string>,
  agreementIds: Set<string>,
  mediaByAppt: Map<string, { before: number; after: number }>,
): DailyJobRow {
  const id = str(row.id);
  const media = mediaByAppt.get(id) ?? { before: 0, after: 0 };
  const address = [row.service_address, row.service_city, row.service_state, row.service_zip].map(str).filter(Boolean).join(', ');
  const phone = str(row.guest_phone);
  const email = str(row.guest_email);
  return {
    id,
    guestName: str(row.guest_name) || 'Guest',
    time: chicagoShort(str(row.scheduled_start)),
    scheduledStart: str(row.scheduled_start),
    status: str(row.status),
    service: str(row.service_slug).replace(/-/g, ' ') || 'Service',
    techName: row.assigned_technician_id ? techNames.get(str(row.assigned_technician_id)) ?? 'Assigned' : 'Unassigned',
    href: woHref(id),
    hasAddress: Boolean(address),
    hasContact: Boolean(phone || email),
    hasAgreement: agreementIds.has(id),
    hasBeforePhotos: media.before > 0,
    hasAfterPhotos: media.after > 0,
    balanceDueCents: cents(row.balance_due_cents),
    basePriceCents: cents(row.base_price_cents),
  };
}

let snapshotCache: { at: number; data: OperationsSnapshot } | null = null;
const SNAPSHOT_CACHE_MS = 60_000;

function formatServiceAddress(row: ApptRow) {
  return [row.service_address, row.service_city, row.service_state, row.service_zip].filter(Boolean).map(String).join(', ').trim();
}

function hasServiceAddress(row: ApptRow) {
  return Boolean(formatServiceAddress(row));
}

async function fetchFleetInquiriesSafe(admin: SupabaseClient) {
  const res = await admin
    .from('fleet_inquiries')
    .select('id, company_name, contact_name, created_at, status')
    .order('created_at', { ascending: false })
    .limit(100);
  if (res.error) return { data: [] as Record<string, unknown>[] };
  return res;
}

export async function loadOperationsSnapshot(
  admin: SupabaseClient,
  opts?: { force?: boolean },
): Promise<OperationsSnapshot> {
  if (!opts?.force && snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_CACHE_MS) {
    return snapshotCache.data;
  }

  const refreshedAt = new Date().toISOString();
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const todayStart = startOfTodayChicagoIso();
  const todayEnd = endOfTodayChicagoIso();
  const weekStart = startOfWeekIso();
  const now = new Date().toISOString();

  const baseAddress = process.env.BUSINESS_HOME_BASE_ADDRESS?.trim() || 'Austin, TX';

  const [
    stripe,
    debugRes,
    outboxRes,
    orphanPayRes,
    paymentsRes,
    receiptsRes,
    apptsRes,
    agreementRes,
    agreementDetailRes,
    mediaRes,
    messagesRes,
    leadsRes,
    fleetRes,
    timersRes,
    techsRes,
    todayPayments,
    weekPayments,
    weather,
    galleryRes,
  ] = await Promise.all([
    getStripeSecrets(admin),
    admin
      .from('payment_debug_events')
      .select('id, event_type, error_message, appointment_id, created_at')
      .not('error_message', 'is', null)
      .gte('created_at', since30)
      .order('created_at', { ascending: false })
      .limit(80),
    admin
      .from('notification_outbox')
      .select('id, kind, status, channel, error_message, skipped_reason, appointment_id, created_at, payload')
      .in('status', ['failed', 'error', 'skipped'])
      .gte('created_at', since30)
      .order('created_at', { ascending: false })
      .limit(120),
    admin
      .from('payments')
      .select(
        'id, amount_cents, payment_method, payment_kind, status, appointment_id, fallback_booking_id, created_at, paid_at, stripe_payment_intent_id, exclude_from_revenue, metadata',
      )
      .in('status', ['succeeded', 'paid'])
      .is('appointment_id', null)
      .is('fallback_booking_id', null)
      .order('created_at', { ascending: false })
      .limit(60),
    admin
      .from('payments')
      .select(
        'id, amount_cents, status, payment_method, payment_kind, voided_at, voided, created_at, paid_at, appointment_id, metadata, stripe_checkout_session_id, stripe_payment_intent_id, provider, is_test, exclude_from_revenue, refunded_at, refunded_amount_cents',
      )
      .order('created_at', { ascending: false })
      .limit(2500),
    admin
      .from('receipts')
      .select('id, payment_id, appointment_id, amount_cents, exclude_from_revenue, created_at, voided_at, status')
      .order('created_at', { ascending: false })
      .limit(1500),
    admin
      .from('appointments')
      .select(
        'id, guest_name, guest_email, guest_phone, status, payment_status, balance_due_cents, base_price_cents, deposit_amount_cents, scheduled_start, job_completed_at, updated_at, created_at, assigned_technician_id, service_slug, service_address, service_city, service_state, service_zip, stripe_checkout_session_id, fallback_booking_id, archived, archived_at, deleted_at, intake_completed_at',
      )
      .order('scheduled_start', { ascending: true })
      .limit(800),
    admin.from('signed_agreements').select('appointment_id, pdf_url, signed_at').limit(8000),
    admin
      .from('signed_agreements')
      .select('appointment_id, sms_consent, photo_consent, photos_consent, media_consent, marketing_photo_consent')
      .limit(8000),
    admin.from('job_media').select('appointment_id, category, photo_category').limit(10000),
    admin.from('messages').select('id, from_name, subject, status, created_at').eq('status', 'new').order('created_at', { ascending: false }).limit(40),
    admin.from('leads').select('id, full_name, email, status, created_at, updated_at, last_contact_at').order('created_at', { ascending: false }).limit(200),
    fetchFleetInquiriesSafe(admin),
    admin.from('tech_job_timers').select('appointment_id, duration_seconds, technician_id').not('duration_seconds', 'is', null).limit(2000),
    admin.from('profiles').select('id, full_name, email, role').in('role', ['technician', 'admin', 'super_admin']),
    fetchPaymentsSince(admin, todayStart, todayEnd),
    fetchPaymentsSince(admin, weekStart, now),
    fetchWeatherForAddress(baseAddress),
    admin
      .from('gallery_images')
      .select('id, title, appointment_id, before_photo_url, after_photo_url, destination, published, metadata')
      .order('created_at', { ascending: false })
      .limit(300),
  ]);

  const items: OperationException[] = [];
  const apptRows = ((apptsRes.data ?? []) as ApptRow[]).filter((r) => !isTestLikeJob(r));
  const agreementIds = new Set((agreementRes.data ?? []).map((r) => str(r.appointment_id)));
  const agreementPdfMissing = new Set(
    (agreementRes.data ?? []).filter((r) => !str(r.pdf_url)).map((r) => str(r.appointment_id)),
  );
  const agreementByAppt = new Map<string, Record<string, unknown>>();
  for (const row of agreementDetailRes.data ?? []) {
    agreementByAppt.set(str(row.appointment_id), row as Record<string, unknown>);
  }

  const techNames = new Map<string, string>();
  for (const t of techsRes.data ?? []) {
    const row = t as { id: string; full_name?: string | null; email?: string | null };
    techNames.set(row.id, str(row.full_name) || str(row.email) || 'Tech');
  }

  const mediaByAppt = new Map<string, { before: number; after: number }>();
  for (const m of mediaRes.data ?? []) {
    const aid = str((m as { appointment_id?: string }).appointment_id);
    if (!aid) continue;
    const cat = `${str((m as { category?: string }).category)} ${str((m as { photo_category?: string }).photo_category)}`.toLowerCase();
    const row = mediaByAppt.get(aid) ?? { before: 0, after: 0 };
    if (cat.includes('before')) row.before += 1;
    if (cat.includes('after')) row.after += 1;
    mediaByAppt.set(aid, row);
  }

  const paymentRows = ((paymentsRes.data ?? []) as PayRow[]).map((p) => ({ ...p, source_table: 'payments' as const }));
  const duplicateGroups = findDuplicatePaymentGroups(paymentRows);

  const receiptRows = (receiptsRes.data ?? []) as Record<string, unknown>[];
  const receiptByPayment = new Map<string, Record<string, unknown>[]>();
  for (const r of receiptRows) {
    const pid = str(r.payment_id);
    if (!pid) continue;
    const list = receiptByPayment.get(pid) ?? [];
    list.push(r);
    receiptByPayment.set(pid, list);
  }

  const paymentIdSet = new Set(paymentRows.map((p) => str(p.id)));
  const receiptsByAppt = new Map<string, Record<string, unknown>[]>();
  for (const r of receiptRows) {
    const aid = str(r.appointment_id);
    if (aid) {
      const list = receiptsByAppt.get(aid) ?? [];
      list.push(r);
      receiptsByAppt.set(aid, list);
    }
  }

  const cashByAppt = new Map<string, number>();
  for (const p of paymentRows) {
    const aid = str(p.appointment_id);
    if (!aid || shouldExcludeFromCashRevenue(p)) continue;
    if (str(p.status).toLowerCase() !== 'succeeded' && str(p.status).toLowerCase() !== 'paid') continue;
    const amt = Math.max(0, cents(p.amount_cents) - cents(p.refunded_amount_cents));
    if (amt <= 0) continue;
    cashByAppt.set(aid, (cashByAppt.get(aid) ?? 0) + amt);
  }

  // --- System / Stripe ---
  if (!stripe.secretKey || !stripe.webhookSecret) {
    items.push({
      id: 'system:stripe-config',
      category: 'system',
      severity: 'critical',
      title: 'Stripe webhook configuration incomplete',
      detail: 'Stripe secret key or webhook signing secret is missing. Payments may not attach to work orders automatically.',
      occurredAt: null,
      href: '/admin/stripe-sync',
      actionLabel: 'Fix Stripe setup',
      suggestedNext: 'Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, then verify webhook health.',
    });
  }

  const resend = getResendEnvStatus();
  if (!resend.ready) {
    items.push({
      id: 'system:resend',
      category: 'system',
      severity: 'warning',
      title: 'Resend email not configured',
      detail: `Missing: ${resend.missing.join(', ')}. Owner and customer emails will be skipped.`,
      occurredAt: null,
      href: '/admin/integrations',
      actionLabel: 'Configure Resend',
      suggestedNext: 'Set RESEND_API_KEY and RESEND_FROM_EMAIL in production environment.',
    });
  }

  if (!twilioConfigured()) {
    items.push({
      id: 'system:twilio',
      category: 'system',
      severity: 'warning',
      title: 'Twilio SMS not configured',
      detail: 'Owner SMS alerts and customer texts require Twilio credentials.',
      occurredAt: null,
      href: '/admin/integrations',
      actionLabel: 'Configure Twilio',
    });
  } else if (process.env.TWILIO_TOLLFREE_VERIFIED !== 'true') {
    items.push({
      id: 'system:twilio-tollfree',
      category: 'system',
      severity: 'info',
      title: 'Toll-free SMS verification pending',
      detail: 'Set TWILIO_TOLLFREE_VERIFIED=true after Twilio toll-free verification completes.',
      occurredAt: null,
      href: '/admin/integrations',
      actionLabel: 'View Twilio status',
    });
  }

  if (!businessNotifyDestination().includes('@')) {
    items.push({
      id: 'system:owner-email',
      category: 'notifications',
      severity: 'warning',
      title: 'Owner alert email not configured',
      detail: 'Set CONTACT_NOTIFY_EMAIL or BUSINESS_NOTIFY_EMAIL for owner alerts.',
      occurredAt: null,
      href: '/admin/integrations',
      actionLabel: 'Configure owner email',
    });
  }

  if (!businessNotifyPhone()) {
    items.push({
      id: 'system:owner-phone',
      category: 'notifications',
      severity: 'info',
      title: 'Owner SMS phone not configured',
      detail: 'Set BUSINESS_NOTIFY_PHONE or OWNER_PHONE for SMS owner alerts.',
      occurredAt: null,
      href: '/admin/integrations',
      actionLabel: 'Configure owner phone',
    });
  }

  if (!weather.ok) {
    items.push({
      id: 'system:weather-key',
      category: 'weather',
      severity: 'warning',
      title: 'Weather forecasts unavailable',
      detail: weather.blocker || 'OpenWeather API key missing.',
      occurredAt: null,
      href: '/admin/integrations#weather',
      actionLabel: 'Configure weather',
    });
  }

  // --- Payment debug / Stripe failures ---
  for (const row of debugRes.data ?? []) {
    const aid = str(row.appointment_id);
    items.push({
      id: `payment:debug:${row.id}`,
      category: 'payments',
      severity: 'critical',
      title: str(row.event_type).replace(/_/g, ' ') || 'Payment processing failure',
      detail: str(row.error_message) || 'Stripe or payment sync failed.',
      workOrderId: aid || null,
      occurredAt: str(row.created_at) || null,
      href: aid ? woHref(aid) : '/admin/revenue',
      actionLabel: aid ? 'Open work order' : 'Open revenue',
      secondaryHref: '/admin/revenue',
      secondaryActionLabel: 'Revenue repair',
      eventType: str(row.event_type),
      suggestedNext: 'Run Stripe sync or payment repair from the work order.',
    });
  }

  // --- Duplicate payment groups ---
  for (const group of duplicateGroups) {
    const winner = group.winnerId;
    const amount = group.rows[0]?.amount_cents ?? 0;
    const apptId = str(group.rows[0]?.appointment_id);
    items.push({
      id: `payment:dup:${group.key}`,
      category: 'payments',
      severity: 'critical',
      title: `Duplicate payment group (${group.rows.length} rows)`,
      detail: `$${(cents(amount) / 100).toFixed(2)} appears ${group.rows.length} times. Canonical row: ${winner?.slice(0, 8) ?? 'unknown'}.`,
      workOrderId: apptId || null,
      paymentId: winner,
      occurredAt: str(group.rows[0]?.paid_at || group.rows[0]?.created_at) || null,
      href: '/admin/revenue',
      actionLabel: 'Repair duplicates',
      secondaryHref: apptId ? woHref(apptId) : undefined,
      secondaryActionLabel: apptId ? 'Open work order' : undefined,
      suggestedNext: 'Use Repair all safely on Revenue page to exclude duplicate rows.',
      inlineActions: [
        { type: 'repair_duplicates', label: 'Repair all safely' },
        ...(apptId ? [] : []),
      ],
    });
  }

  // --- Duplicate receipt groups ---
  for (const [pid, group] of receiptByPayment.entries()) {
    if (group.length <= 1) continue;
    items.push({
      id: `receipt:dup:${pid}`,
      category: 'payments',
      severity: 'warning',
      title: `Duplicate receipt rows for one payment`,
      detail: `${group.length} receipt records linked to payment ${pid.slice(0, 8)}.`,
      paymentId: pid,
      occurredAt: str(group[0]?.created_at) || null,
      href: '/admin/receipts',
      actionLabel: 'Review receipts',
      suggestedNext: 'Exclude duplicate receipt rows from revenue.',
    });
  }

  for (const r of receiptRows) {
    const rid = str(r.id);
    const pid = str(r.payment_id);
    if (pid && !paymentIdSet.has(pid)) {
      items.push({
        id: `receipt:orphan:${rid}`,
        category: 'payments',
        severity: 'critical',
        title: 'Receipt references missing payment',
        detail: `Receipt ${rid.slice(0, 8)} links to payment ${pid.slice(0, 8)} which no longer exists.`,
        receiptId: rid,
        paymentId: pid,
        workOrderId: str(r.appointment_id) || null,
        occurredAt: str(r.created_at) || null,
        href: `/admin/receipts/${rid}`,
        actionLabel: 'Open receipt',
        secondaryHref: '/admin/revenue',
        secondaryActionLabel: 'Revenue diagnostics',
      });
    }
    if (!pid) {
      items.push({
        id: `receipt:no-payment:${rid}`,
        category: 'payments',
        severity: 'warning',
        title: 'Receipt has no linked payment',
        detail: `Receipt ${rid.slice(0, 8)} is not tied to a payment record.`,
        receiptId: rid,
        workOrderId: str(r.appointment_id) || null,
        occurredAt: str(r.created_at) || null,
        href: `/admin/receipts/${rid}`,
        actionLabel: 'Review receipt',
      });
    }
  }

  // --- Orphan payments ---
  for (const row of orphanPayRes.data ?? []) {
    items.push({
      id: `payment:orphan:${row.id}`,
      category: 'payments',
      severity: 'critical',
      title: 'Unmatched Stripe payment (no work order)',
      detail: `$${(cents(row.amount_cents) / 100).toFixed(2)} via ${str(row.payment_method) || 'stripe'} is not linked to any job.`,
      paymentId: str(row.id),
      occurredAt: str(row.paid_at || row.created_at) || null,
      href: `/admin/payments/${row.id}`,
      actionLabel: 'Open payment repair',
      secondaryHref: '/admin/revenue',
      secondaryActionLabel: 'Revenue diagnostics',
      suggestedNext: 'Link payment to work order or exclude if duplicate.',
    });
  }

  // --- Excluded but suspicious payment rows ---
  for (const p of paymentRows) {
    if (p.exclude_from_revenue !== true) continue;
    const meta = p.metadata && typeof p.metadata === 'object' ? (p.metadata as Record<string, unknown>) : null;
    if (meta?.merged_into_payment_id || meta?.duplicate_of_stripe) continue;
    const aid = str(p.appointment_id);
    items.push({
      id: `payment:excluded:${p.id}`,
      category: 'payments',
      severity: 'info',
      title: 'Payment manually excluded from revenue',
      detail: `$${(cents(p.amount_cents) / 100).toFixed(2)} excluded — verify this is intentional.`,
      paymentId: str(p.id),
      workOrderId: aid || null,
      occurredAt: str(p.paid_at || p.created_at) || null,
      href: `/admin/payments/${p.id}`,
      actionLabel: 'Review payment',
      inlineActions: [{ type: 'exclude_payment', label: 'Exclude row', paymentId: str(p.id) }],
    });
  }

  for (const g of galleryRes.data ?? []) {
    const gid = str(g.id);
    const meta = g.metadata && typeof g.metadata === 'object' ? (g.metadata as Record<string, unknown>) : {};
    const phase = str(meta.transformation_phase);
    const hasBefore = Boolean(str(g.before_photo_url));
    const hasAfter = Boolean(str(g.after_photo_url));
    const needsClass =
      Boolean(g.appointment_id) &&
      (!hasBefore || !hasAfter) &&
      phase !== 'before_after' &&
      str(g.destination) !== 'featured';
    if (needsClass) {
      items.push({
        id: `photos:gallery:${gid}`,
        category: 'photos',
        severity: 'info',
        title: `Gallery item needs before/after classification`,
        detail: str(g.title) || `Gallery row ${gid.slice(0, 8)} is missing paired before/after metadata.`,
        workOrderId: str(g.appointment_id) || null,
        occurredAt: null,
        href: '/admin/cms',
        actionLabel: 'Classify in gallery',
        secondaryHref: str(g.appointment_id) ? woHref(str(g.appointment_id)) : undefined,
        secondaryActionLabel: str(g.appointment_id) ? 'Open work order' : undefined,
      });
    }
  }

  const weatherByAppt = new Map<string, WeatherSnapshot>();
  const weatherPrefetchTargets = apptRows
    .filter((row) => {
      const scheduled = str(row.scheduled_start);
      return (isTodayChicago(scheduled) || isTomorrowChicago(scheduled)) && hasServiceAddress(row as ApptRow);
    })
    .slice(0, 12);
  await Promise.all(
    weatherPrefetchTargets.map(async (row) => {
      const id = str(row.id);
      const w = await fetchWeatherForAddress(formatServiceAddress(row as ApptRow), str(row.scheduled_start));
      weatherByAppt.set(id, w);
    }),
  );

  const todaySummary = summarizePayments(todayPayments, { excludeTest: true, fromIso: todayStart, toIso: todayEnd });
  const weekSummary = summarizePayments(weekPayments, { excludeTest: true, fromIso: weekStart, toIso: now });

  const rainDays = new Set((weather.rainWarningDays ?? []).map((d) => d.toLowerCase()));
  const todayDayName = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'long' }).toLowerCase();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowDayName = tomorrowDate.toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'long' }).toLowerCase();
  const todayWeatherRisk = rainDays.has(todayDayName) || (weather.rainChancePct ?? 0) >= 60;
  const tomorrowWeatherRisk = rainDays.has(tomorrowDayName);

  let todayJobs: DailyJobRow[] = [];
  let tomorrowJobs: DailyJobRow[] = [];
  let weekScheduled = 0;
  let weekExpectedCents = 0;
  let weekCompleted = 0;
  let openReceivablesCents = 0;
  let followUpsDue = 0;

  const weekEndKey = dateKeyChicago(new Date(Date.now() + 7 * 86400000));

  for (const row of apptRows) {
    const id = str(row.id);
    const status = str(row.status).toLowerCase();
    if (['cancelled', 'deleted', 'archived', 'voided'].includes(status)) continue;

    const scheduled = str(row.scheduled_start);
    const job = buildDailyJobRow(row, techNames, agreementIds, mediaByAppt);
    const obCtx = {
      cashCollectedCents: cashByAppt.get(id) ?? 0,
      hasRealStripePayment: paymentRows.some((p) => str(p.appointment_id) === id && isRealStripePayment(p as PayRow)),
    };

    if (isTodayChicago(scheduled) && !['cancelled', 'deleted'].includes(status)) {
      todayJobs.push(job);
      if (!row.assigned_technician_id) {
        items.push({
          id: `wo:unassigned-today:${id}`,
          category: 'work_orders',
          severity: 'warning',
          title: `Today's job has no technician — ${job.guestName}`,
          detail: `${job.service} at ${job.time}. Assign before dispatch.`,
          customerName: job.guestName,
          workOrderId: id,
          occurredAt: scheduled,
          href: '/admin/dispatch',
          actionLabel: 'Assign tech',
          secondaryHref: job.href,
          secondaryActionLabel: 'Open work order',
        });
      }
      if (!job.hasAddress) {
        items.push({
          id: `wo:no-address-today:${id}`,
          category: 'work_orders',
          severity: 'critical',
          title: `Missing service address — ${job.guestName}`,
          detail: "Today's job cannot be routed without a complete address.",
          customerName: job.guestName,
          workOrderId: id,
          occurredAt: scheduled,
          href: job.href,
          actionLabel: 'Fix address',
        });
        if (weather.ok) {
          items.push({
            id: `weather:no-address:${id}`,
            category: 'weather',
            severity: 'warning',
            title: `Weather cannot be checked — ${job.guestName}`,
            detail: 'Service address is missing, so rain risk cannot be evaluated for this job.',
            customerName: job.guestName,
            workOrderId: id,
            occurredAt: scheduled,
            href: job.href,
            actionLabel: 'Fix address',
            secondaryHref: '/admin/dispatch',
            secondaryActionLabel: 'Open dispatch',
          });
        }
      }
      if (!job.hasContact) {
        items.push({
          id: `wo:no-contact-today:${id}`,
          category: 'work_orders',
          severity: 'warning',
          title: `Missing customer contact — ${job.guestName}`,
          detail: 'No phone or email on file for a job scheduled today.',
          customerName: job.guestName,
          workOrderId: id,
          occurredAt: scheduled,
          href: job.href,
          actionLabel: 'Update contact',
        });
      }
      const jobWeather = weatherByAppt.get(id);
      const jobRainRisk = jobWeather?.ok
        ? (jobWeather.rainChancePct ?? 0) >= 60 || Boolean(jobWeather.severe) || (jobWeather.rainWarningDays?.length ?? 0) > 0
        : todayWeatherRisk;
      if (jobRainRisk) {
        items.push({
          id: `weather:today:${id}`,
          category: 'weather',
          severity: 'warning',
          title: `Rain risk today — ${job.guestName}`,
          detail: jobWeather?.ok
            ? `${jobWeather.description ?? 'Elevated rain probability'} at service address.`
            : weather.rainWarningDays?.length
              ? `High rain probability expected (${weather.rainWarningDays.join(', ')}).`
              : `Rain chance ${weather.rainChancePct ?? 0}%. Consider reschedule or covered work.`,
          customerName: job.guestName,
          workOrderId: id,
          occurredAt: scheduled,
          href: job.href,
          actionLabel: 'Open work order',
          secondaryHref: '/admin/calendar',
          secondaryActionLabel: 'Open calendar',
        });
      }
    }

    if (isTomorrowChicago(scheduled)) {
      tomorrowJobs.push(job);
      if (!row.assigned_technician_id) {
        items.push({
          id: `wo:unassigned-tomorrow:${id}`,
          category: 'work_orders',
          severity: 'warning',
          title: `Tomorrow's job unassigned — ${job.guestName}`,
          detail: `${job.service} at ${job.time}.`,
          customerName: job.guestName,
          workOrderId: id,
          occurredAt: scheduled,
          href: '/admin/dispatch',
          actionLabel: 'Assign tech',
        });
      }
      if (tomorrowWeatherRisk) {
        const jobWeather = weatherByAppt.get(id);
        items.push({
          id: `weather:tomorrow:${id}`,
          category: 'weather',
          severity: 'warning',
          title: `Rain risk tomorrow — ${job.guestName}`,
          detail: jobWeather?.ok
            ? `${jobWeather.description ?? 'Elevated rain probability'} at service address.`
            : 'Tomorrow shows elevated rain probability in the service-area forecast.',
          customerName: job.guestName,
          workOrderId: id,
          occurredAt: scheduled,
          href: job.href,
          actionLabel: 'Review job',
          secondaryHref: '/admin/calendar',
          secondaryActionLabel: 'Open calendar',
        });
      }
      if (!hasServiceAddress(row as ApptRow) && weather.ok) {
        items.push({
          id: `weather:no-address-tomorrow:${id}`,
          category: 'weather',
          severity: 'info',
          title: `Tomorrow weather unavailable — ${job.guestName}`,
          detail: 'Add a service address to evaluate rain risk for tomorrow’s job.',
          customerName: job.guestName,
          workOrderId: id,
          occurredAt: scheduled,
          href: job.href,
          actionLabel: 'Fix address',
        });
      }
    }

    const dayKey = dateKeyChicago(scheduled);
    if (dayKey >= dateKeyChicago(new Date()) && dayKey <= weekEndKey && status !== 'cancelled') {
      weekScheduled += 1;
      weekExpectedCents += cents(row.base_price_cents);
    }
    if (status === 'completed' && isTodayChicago(str(row.job_completed_at || row.updated_at || scheduled))) {
      weekCompleted += 1;
    }

    const balance = cents(row.balance_due_cents);
    if (balance > 0 && isActionableOpenBalance(row as OpenBalanceAppt, obCtx)) {
      openReceivablesCents += balance;
    } else if (balance > 0 && isStaleOpenBalance(row as OpenBalanceAppt, obCtx)) {
      items.push({
        id: `balance:stale:${id}`,
        category: 'payments',
        severity: 'info',
        title: `Stale open balance — ${job.guestName}`,
        detail: `$${(balance / 100).toFixed(2)} — ${classifyOpenBalance(row as OpenBalanceAppt, obCtx).reason}`,
        customerName: job.guestName,
        workOrderId: id,
        occurredAt: scheduled,
        href: job.href,
        actionLabel: 'Review balance',
      });
    }

    const deposit = cents(row.deposit_amount_cents);
    const pdCtx = { hasRealStripePayment: obCtx.hasRealStripePayment, paymentLinkValid: Boolean(row.stripe_checkout_session_id) };
    if (deposit > 0 && isStalePendingDeposit(row as OpenBalanceAppt, pdCtx)) {
      items.push({
        id: `deposit:stale:${id}`,
        category: 'payments',
        severity: 'warning',
        title: `Stale pending deposit — ${job.guestName}`,
        detail: `$${(deposit / 100).toFixed(2)} awaiting payment >24h.`,
        customerName: job.guestName,
        workOrderId: id,
        occurredAt: scheduled,
        href: job.href,
        actionLabel: 'Collect deposit',
      });
    }

    if (status === 'completed' && !agreementIds.has(id)) {
      items.push({
        id: `agreement:missing-completed:${id}`,
        category: 'agreements',
        severity: 'critical',
        title: `Completed job missing signed agreement — ${job.guestName}`,
        detail: 'Job was completed without a signed agreement on file.',
        customerName: job.guestName,
        workOrderId: id,
        occurredAt: str(row.job_completed_at) || scheduled,
        href: job.href,
        actionLabel: 'Recapture agreement',
        secondaryHref: `${job.href}?recapture=1`,
        secondaryActionLabel: 'Send agreement',
      });
    }

    if (agreementPdfMissing.has(id)) {
      items.push({
        id: `agreement:pdf-missing:${id}`,
        category: 'agreements',
        severity: 'warning',
        title: `Agreement PDF missing — ${job.guestName}`,
        detail: 'Signed agreement record exists but PDF/download is missing.',
        customerName: job.guestName,
        workOrderId: id,
        occurredAt: scheduled,
        href: job.href,
        actionLabel: 'Open agreement',
      });
    }

    const upcomingStatuses = ['confirmed', 'assigned', 'deposit_paid', 'balance_due', 'in_progress', 'pending', 'awaiting_deposit'];
    if (upcomingStatuses.includes(status) && new Date(scheduled).getTime() > Date.now() && !agreementIds.has(id)) {
      items.push({
        id: `agreement:missing-upcoming:${id}`,
        category: 'agreements',
        severity: 'warning',
        title: `Upcoming job missing agreement — ${job.guestName}`,
        detail: `${job.service} on ${job.time} has no signed agreement yet.`,
        customerName: job.guestName,
        workOrderId: id,
        occurredAt: scheduled,
        href: job.href,
        actionLabel: 'Send agreement',
      });
    }

    if (!str(row.intake_completed_at) && ['confirmed', 'assigned', 'in_progress'].includes(status)) {
      items.push({
        id: `agreement:intake:${id}`,
        category: 'agreements',
        severity: 'info',
        title: `Intake incomplete — ${job.guestName}`,
        detail: 'Customer intake/consent record is incomplete for an active job.',
        customerName: job.guestName,
        workOrderId: id,
        occurredAt: scheduled,
        href: job.href,
        actionLabel: 'Complete intake',
      });
    }

    const agreementRow = agreementByAppt.get(id);
    if (agreementIds.has(id) && agreementRow) {
      const smsOk = Boolean(agreementRow.sms_consent);
      const photoOk = Boolean(agreementRow.photo_consent || agreementRow.photos_consent || agreementRow.before_after_photo_consent);
      const mediaOk = Boolean(agreementRow.media_consent || agreementRow.marketing_photo_consent || agreementRow.social_media_consent);
      if (!smsOk) {
        items.push({
          id: `agreement:sms-consent:${id}`,
          category: 'agreements',
          severity: 'warning',
          title: `Missing SMS consent — ${job.guestName}`,
          detail: 'Signed agreement exists but SMS consent was not captured.',
          customerName: job.guestName,
          workOrderId: id,
          occurredAt: scheduled,
          href: job.href,
          actionLabel: 'Recapture agreement',
        });
      }
      if (!photoOk) {
        items.push({
          id: `agreement:photo-consent:${id}`,
          category: 'agreements',
          severity: 'warning',
          title: `Missing photo consent — ${job.guestName}`,
          detail: 'Before/after photo consent was not recorded on the agreement.',
          customerName: job.guestName,
          workOrderId: id,
          occurredAt: scheduled,
          href: job.href,
          actionLabel: 'Open agreement',
        });
      }
      if (!mediaOk) {
        items.push({
          id: `agreement:media-consent:${id}`,
          category: 'agreements',
          severity: 'info',
          title: `Missing media/marketing consent — ${job.guestName}`,
          detail: 'Social/marketing photo consent was not recorded.',
          customerName: job.guestName,
          workOrderId: id,
          occurredAt: scheduled,
          href: job.href,
          actionLabel: 'Open agreement',
        });
      }
    }

    const serviceSlug = str(row.service_slug).toLowerCase();
    if (serviceSlug.includes('fleet') && ['assigned', 'confirmed', 'in_progress'].includes(status)) {
      const apptPhotos = (mediaRes.data ?? []).filter((m) => str((m as { appointment_id?: string }).appointment_id) === id);
      const assessment = assessBeforePhotoSlots(apptPhotos, serviceSlug);
      if (assessment.missing.length > 0) {
        items.push({
          id: `photos:fleet-inspection:${id}`,
          category: 'photos',
          severity: 'warning',
          title: `Fleet job missing inspection photos — ${job.guestName}`,
          detail: `Missing slots: ${assessment.missing.join(', ')}.`,
          customerName: job.guestName,
          workOrderId: id,
          occurredAt: scheduled,
          href: `${job.href}#photos`,
          actionLabel: 'Upload inspection photos',
        });
      }
    }

    if (status === 'completed') {
      const apptReceipts = receiptsByAppt.get(id) ?? [];
      const hasReceipt = apptReceipts.some(
        (r) => !str(r.voided_at) && !['voided', 'excluded'].includes(str(r.status).toLowerCase()),
      );
      if (!hasReceipt && (cashByAppt.get(id) ?? 0) > 0) {
        items.push({
          id: `receipt:missing-completed:${id}`,
          category: 'payments',
          severity: 'warning',
          title: `Completed job missing receipt — ${job.guestName}`,
          detail: 'Payment was collected but no valid receipt is on file.',
          customerName: job.guestName,
          workOrderId: id,
          occurredAt: str(row.job_completed_at) || scheduled,
          href: job.href,
          actionLabel: 'Issue receipt',
          secondaryHref: '/admin/receipts',
          secondaryActionLabel: 'Open receipts',
        });
      }
    }

    if (status === 'completed' && !job.hasAfterPhotos) {
      items.push({
        id: `photos:after-completed:${id}`,
        category: 'photos',
        severity: 'critical',
        title: `Completed job missing after photos — ${job.guestName}`,
        detail: 'After photos are required for completed work documentation.',
        customerName: job.guestName,
        workOrderId: id,
        occurredAt: str(row.job_completed_at) || scheduled,
        href: `${job.href}#photos`,
        actionLabel: 'Upload photos',
      });
    }

    if (['in_progress', 'assigned', 'confirmed'].includes(status) && !job.hasBeforePhotos) {
      items.push({
        id: `photos:before:${id}`,
        category: 'photos',
        severity: 'warning',
        title: `Missing before photos — ${job.guestName}`,
        detail: 'Before photos should be captured before service begins.',
        customerName: job.guestName,
        workOrderId: id,
        occurredAt: scheduled,
        href: `${job.href}#photos`,
        actionLabel: 'Upload before photos',
      });
    }

    if (status === 'completed' && balance > 0) {
      items.push({
        id: `balance:completed:${id}`,
        category: 'payments',
        severity: 'critical',
        title: `Unpaid completed job — ${job.guestName}`,
        detail: `$${(balance / 100).toFixed(2)} still owed after completion.`,
        customerName: job.guestName,
        workOrderId: id,
        occurredAt: str(row.job_completed_at) || scheduled,
        href: job.href,
        actionLabel: 'Collect balance',
      });
    }

    // Follow-ups: completed 30/60/90 days ago, no future booking
    if (status === 'completed') {
      const completedAt = new Date(str(row.job_completed_at || row.updated_at || scheduled)).getTime();
      const daysSince = (Date.now() - completedAt) / 86400000;
      const hasFuture = apptRows.some(
        (other) =>
          str(other.guest_email) === str(row.guest_email) &&
          str(other.id) !== id &&
          new Date(str(other.scheduled_start)).getTime() > Date.now() &&
          !['cancelled', 'deleted'].includes(str(other.status).toLowerCase()),
      );
      if (!hasFuture && daysSince >= 30 && daysSince < 400) {
        const tier = daysSince >= 90 ? 90 : daysSince >= 60 ? 60 : 30;
        items.push({
          id: `followup:${tier}:${id}`,
          category: 'customers',
          severity: tier >= 90 ? 'warning' : 'info',
          title: `${tier}-day follow-up due — ${job.guestName}`,
          detail: `Last service ${Math.floor(daysSince)} days ago with no upcoming booking.`,
          customerName: job.guestName,
          workOrderId: id,
          occurredAt: str(row.job_completed_at) || scheduled,
          href: `/admin/customers?search=${encodeURIComponent(str(row.guest_email) || job.guestName)}`,
          actionLabel: 'Open customer',
          suggestedNext: tier >= 90 ? 'Send win-back offer' : 'Send maintenance reminder',
          inlineActions: [
            {
              type: 'send_followup',
              label: 'Send follow-up',
              customerEmail: str(row.guest_email) || undefined,
              customerPhone: str(row.guest_phone) || undefined,
            },
            { type: 'create_offer', label: 'Create offer', customerEmail: str(row.guest_email) || undefined },
          ],
        });
        followUpsDue += 1;
      }
    }
  }

  // Fast completion detection
  const timerByAppt = new Map<string, number>();
  for (const t of timersRes.data ?? []) {
    const aid = str((t as { appointment_id?: string }).appointment_id);
    const dur = cents((t as { duration_seconds?: number }).duration_seconds);
    if (aid && dur > 0) timerByAppt.set(aid, Math.max(timerByAppt.get(aid) ?? 0, dur));
  }
  for (const row of apptRows) {
    if (str(row.status) !== 'completed') continue;
    const dur = timerByAppt.get(str(row.id));
    if (dur != null && dur < 20 * 60) {
      items.push({
        id: `photos:fast-complete:${row.id}`,
        category: 'photos',
        severity: 'info',
        title: `Unusually fast completion — ${str(row.guest_name) || 'Customer'}`,
        detail: `Job timer shows ${Math.round(dur / 60)} minutes. Verify photo documentation and QA.`,
        customerName: str(row.guest_name),
        workOrderId: str(row.id),
        occurredAt: str(row.job_completed_at),
        href: woHref(str(row.id)),
        actionLabel: 'Open QA checklist',
        secondaryHref: '/admin/qa-checklist',
        secondaryActionLabel: 'QA checklist',
      });
    }
  }

  // Notifications
  for (const row of outboxRes.data ?? []) {
    const failed = ['failed', 'error'].includes(str(row.status).toLowerCase());
    const payload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>;
    items.push({
      id: `notify:${row.id}`,
      category: 'notifications',
      severity: failed ? 'critical' : 'warning',
      title: `${str(row.kind).replace(/_/g, ' ') || 'Notification'} — ${row.status}`,
      detail: str(row.error_message || row.skipped_reason) || 'Delivery did not complete.',
      workOrderId: str(row.appointment_id) || null,
      outboxId: str(row.id),
      occurredAt: str(row.created_at) || null,
      href: str(row.appointment_id) ? woHref(str(row.appointment_id)) : '/admin/notifications',
      actionLabel: 'View notification log',
      channel: str(row.channel),
      recipient: str(payload.to || payload.destination_e164),
      eventType: str(row.kind),
      suggestedNext: failed ? 'Fix provider config and retry send.' : 'Review skipped reason.',
      inlineActions: failed
        ? [{ type: 'retry_notification', label: 'Retry send', outboxId: str(row.id) }]
        : undefined,
    });
  }

  for (const msg of messagesRes.data ?? []) {
    items.push({
      id: `message:${msg.id}`,
      category: 'notifications',
      severity: 'warning',
      title: `Customer message needs response`,
      detail: str(msg.subject) || 'New inbound message awaiting reply.',
      occurredAt: str(msg.created_at) || null,
      href: '/admin/messages',
      actionLabel: 'Open messages',
      customerName: str(msg.from_name),
    });
  }

  // Leads stale
  for (const lead of leadsRes.data ?? []) {
    const status = str(lead.status).toLowerCase();
    if (['booked', 'converted', 'closed', 'archived'].includes(status)) continue;
    const anchor = str(lead.last_contact_at || lead.updated_at || lead.created_at);
    const ageMs = anchor ? Date.now() - new Date(anchor).getTime() : 0;
    if (ageMs >= 7 * 86400000) {
      items.push({
        id: `lead:stale:${lead.id}`,
        category: 'leads',
        severity: 'warning',
        title: `Lead needs follow-up — ${str(lead.full_name) || str(lead.email) || 'Lead'}`,
        detail: `No response in ${Math.floor(ageMs / 86400000)} days.`,
        occurredAt: anchor,
        href: '/admin/leads',
        actionLabel: 'Open leads',
        suggestedNext: 'Contact lead and update status.',
        inlineActions: [{ type: 'send_followup', label: 'Send follow-up', customerEmail: str(lead.email) || undefined }],
      });
    }
  }

  for (const fi of fleetRes.data ?? []) {
    const status = str(fi.status).toLowerCase();
    if (['closed', 'converted', 'booked'].includes(status)) continue;
    const anchor = str(fi.created_at);
    if (anchor && Date.now() - new Date(anchor).getTime() >= 7 * 86400000) {
      items.push({
        id: `fleet:stale:${fi.id}`,
        category: 'leads',
        severity: 'warning',
        title: `Fleet inquiry needs response — ${str(fi.company_name) || str(fi.contact_name) || 'Fleet'}`,
        detail: 'Fleet inquiry older than 7 days without conversion.',
        occurredAt: anchor,
        href: '/admin/fleet',
        actionLabel: 'Open fleet CRM',
      });
    }
  }

  // Manual cash on non-completed jobs
  for (const p of paymentRows) {
    if (shouldExcludeFromCashRevenue(p)) continue;
    const method = `${str(p.payment_method)} ${str(p.payment_kind)}`.toLowerCase();
    if (!method.includes('cash') && !method.includes('zelle') && !method.includes('venmo') && !method.includes('manual')) continue;
    const aid = str(p.appointment_id);
    if (!aid) continue;
    const appt = apptRows.find((a) => str(a.id) === aid);
    if (!appt || str(appt.status) === 'completed') continue;
    items.push({
      id: `payment:manual-open:${p.id}`,
      category: 'payments',
      severity: 'info',
      title: `Field payment on open job — ${str(appt.guest_name) || 'Customer'}`,
      detail: `$${(cents(p.amount_cents) / 100).toFixed(2)} recorded before job completion.`,
      paymentId: str(p.id),
      workOrderId: aid,
      customerName: str(appt.guest_name),
      occurredAt: str(p.paid_at || p.created_at) || null,
      href: woHref(aid),
      actionLabel: 'Review work order',
    });
  }

  items.sort((a, b) => {
    const sev = { critical:  0, warning: 1, info: 2 };
    const d = sev[a.severity] - sev[b.severity];
    if (d !== 0) return d;
    return str(b.occurredAt).localeCompare(str(a.occurredAt));
  });

  const dismissed = await loadDismissedFingerprints(admin);
  const visibleItems = items.filter((item) => !dismissed.has(item.id));
  await syncBusinessExceptions(admin, visibleItems);
  const summary = summarizeExceptions(visibleItems);

  const unpaidCompletedToday = todayJobs.filter((j) => j.status === 'completed' && j.balanceDueCents > 0);
  const dailyOps: DailyOperationsBoard = {
    refreshedAt,
    today: {
      jobCount: todayJobs.length,
      jobs: todayJobs,
      missingTech: todayJobs.filter((j) => j.techName === 'Unassigned').length,
      missingAddress: todayJobs.filter((j) => !j.hasAddress).length,
      missingAgreement: todayJobs.filter((j) => !j.hasAgreement).length,
      missingBeforePhotos: todayJobs.filter((j) => !j.hasBeforePhotos).length,
      missingAfterPhotos: todayJobs.filter((j) => j.status === 'completed' && !j.hasAfterPhotos).length,
      techniciansAssigned: new Set(
        todayJobs.map((j) => j.techName).filter((name) => name && name !== 'Unassigned'),
      ).size,
      weatherRisk: todayWeatherRisk,
      weatherNote: todayWeatherRisk
        ? weather.rainWarningDays?.join(', ') || `Rain chance ${weather.rainChancePct ?? 0}%`
        : null,
      projectedRevenueCents: todayJobs.reduce((s, j) => s + j.basePriceCents, 0),
      collectedCents: todaySummary.grossCents,
      unpaidCompletedCents: unpaidCompletedToday.reduce((s, j) => s + j.balanceDueCents, 0),
      unpaidCompletedCount: unpaidCompletedToday.length,
    },
    tomorrow: {
      jobCount: tomorrowJobs.length,
      jobs: tomorrowJobs,
      unassigned: tomorrowJobs.filter((j) => j.techName === 'Unassigned').length,
      weatherRisk: tomorrowWeatherRisk,
      weatherNote: tomorrowWeatherRisk ? 'Elevated rain risk in forecast' : null,
      prepChecklist: [
        'Confirm technician assignments',
        'Verify addresses and gate codes',
        'Check agreements signed',
        'Review weather-sensitive jobs',
      ],
    },
    week: {
      scheduledJobs: weekScheduled,
      expectedRevenueCents: weekExpectedCents,
      completedJobs: weekCompleted,
      openReceivablesCents: openReceivablesCents,
      followUpsDue,
    },
    revenueTodayCents: todaySummary.grossCents,
    revenueWeekCents: weekSummary.grossCents,
  };

  const snapshot: OperationsSnapshot = { refreshedAt, exceptions: visibleItems, summary, dailyOps };
  snapshotCache = { at: Date.now(), data: snapshot };
  return snapshot;
}

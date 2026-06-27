import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { getAppOrigin } from '@/lib/env/app-origin';
import { sendResendHtml } from '@/lib/email-send';
import { glossBossEmailLayout, emailCtaButton } from '@/lib/email/templates/layout';
import { createDepositCheckoutSession } from '@/lib/stripe/checkout';
import { displayMoney } from '@/lib/display-format';
import { recordJobTimelineEvent } from '@/lib/job-timeline-server';

export type EstimateStatus =
  | 'draft'
  | 'sent'
  | 'approved'
  | 'declined'
  | 'deposit_paid'
  | 'converted'
  | 'expired';

export type EstimateLineItem = {
  label: string;
  amountCents: number;
};

export type ServiceEstimate = {
  id: string;
  leadId: string | null;
  customerId: string | null;
  appointmentId: string | null;
  accessToken: string;
  status: EstimateStatus;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  serviceAddress: string | null;
  vehicleDescription: string | null;
  serviceSlug: string | null;
  vehicleClass: string | null;
  lineItems: EstimateLineItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  depositCents: number;
  scheduledStart: string | null;
  notes: string | null;
  validUntil: string | null;
  sentAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  depositPaidAt: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
}

function isMissingTable(message: string) {
  return /service_estimates|schema cache|does not exist|Could not find/i.test(message);
}

function mapRow(row: Record<string, unknown>): ServiceEstimate {
  const lineItemsRaw = row.line_items;
  const lineItems: EstimateLineItem[] = Array.isArray(lineItemsRaw)
    ? lineItemsRaw
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const o = item as Record<string, unknown>;
          return { label: str(o.label) || 'Line item', amountCents: cents(o.amountCents ?? o.amount_cents) };
        })
        .filter(Boolean) as EstimateLineItem[]
    : [];

  return {
    id: str(row.id),
    leadId: row.lead_id ? str(row.lead_id) : null,
    customerId: row.customer_id ? str(row.customer_id) : null,
    appointmentId: row.appointment_id ? str(row.appointment_id) : null,
    accessToken: str(row.access_token),
    status: (str(row.status) || 'draft') as EstimateStatus,
    customerName: str(row.customer_name) || 'Customer',
    customerEmail: row.customer_email ? str(row.customer_email) : null,
    customerPhone: row.customer_phone ? str(row.customer_phone) : null,
    serviceAddress: row.service_address ? str(row.service_address) : null,
    vehicleDescription: row.vehicle_description ? str(row.vehicle_description) : null,
    serviceSlug: row.service_slug ? str(row.service_slug) : null,
    vehicleClass: row.vehicle_class ? str(row.vehicle_class) : null,
    lineItems,
    subtotalCents: cents(row.subtotal_cents),
    discountCents: cents(row.discount_cents),
    totalCents: cents(row.total_cents),
    depositCents: cents(row.deposit_cents),
    scheduledStart: row.scheduled_start ? String(row.scheduled_start) : null,
    notes: row.notes ? String(row.notes) : null,
    validUntil: row.valid_until ? String(row.valid_until) : null,
    sentAt: row.sent_at ? String(row.sent_at) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    declinedAt: row.declined_at ? String(row.declined_at) : null,
    depositPaidAt: row.deposit_paid_at ? String(row.deposit_paid_at) : null,
    convertedAt: row.converted_at ? String(row.converted_at) : null,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function estimatePublicUrl(accessToken: string, origin?: string) {
  const base = (origin ?? getAppOrigin()).replace(/\/$/, '');
  return `${base}/estimate/${accessToken}`;
}

export function buildEstimateSmsBody(estimate: ServiceEstimate, origin?: string) {
  const url = estimatePublicUrl(estimate.accessToken, origin);
  const valid = estimate.validUntil
    ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium' }).format(new Date(estimate.validUntil))
    : null;
  return (
    `Gloss Boss ATX quote for ${estimate.customerName}: ${displayMoney(estimate.totalCents)}` +
    (estimate.depositCents ? ` (deposit ${displayMoney(estimate.depositCents)})` : '') +
    `. Book: ${url}` +
    (valid ? ` · Valid until ${valid}` : '')
  );
}

export function buildEstimateEmailSubject(estimate: ServiceEstimate) {
  return `Your Gloss Boss estimate — ${displayMoney(estimate.totalCents)}`;
}

export function computeDepositCents(totalCents: number, explicitDeposit?: number) {
  if (explicitDeposit != null && explicitDeposit >= 0) return explicitDeposit;
  return Math.max(0, Math.round(totalCents * 0.3));
}

export async function loadEstimatesForLead(admin: SupabaseClient, leadId: string): Promise<ServiceEstimate[]> {
  const { data, error } = await admin
    .from('service_estimates')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    if (isMissingTable(error.message)) return [];
    return [];
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function loadEstimateByToken(admin: SupabaseClient, token: string): Promise<ServiceEstimate | null> {
  const { data, error } = await admin.from('service_estimates').select('*').eq('access_token', token.trim()).maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function loadEstimateById(admin: SupabaseClient, id: string): Promise<ServiceEstimate | null> {
  const { data, error } = await admin.from('service_estimates').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function createEstimateForLead(
  admin: SupabaseClient,
  actorId: string,
  input: {
    leadId: string;
    serviceSlug: string;
    vehicleClass?: string;
    totalCents: number;
    depositCents?: number;
    discountCents?: number;
    scheduledStart?: string;
    notes?: string;
    lineItems?: EstimateLineItem[];
  },
): Promise<{ ok: boolean; error?: string; estimate?: ServiceEstimate }> {
  const probe = await admin.from('service_estimates').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) {
    return { ok: false, error: 'Estimate table not migrated. Apply migration 000085.' };
  }

  const { data: lead, error: leadErr } = await admin.from('leads').select('*').eq('id', input.leadId).maybeSingle();
  if (leadErr || !lead) return { ok: false, error: 'Lead not found' };

  const L = lead as Record<string, unknown>;
  const totalCents = Math.max(0, input.totalCents);
  const depositCents = computeDepositCents(totalCents, input.depositCents);
  const discountCents = Math.max(0, input.discountCents ?? 0);
  const subtotalCents = totalCents + discountCents;
  const lineItems =
    input.lineItems && input.lineItems.length > 0
      ? input.lineItems
      : [{ label: input.serviceSlug.replace(/-/g, ' '), amountCents: totalCents }];

  const now = new Date().toISOString();
  const validUntil = new Date(Date.now() + 14 * 86400000).toISOString();

  const { data, error } = await admin
    .from('service_estimates')
    .insert({
      lead_id: input.leadId,
      customer_id: L.customer_id ?? null,
      status: 'draft',
      customer_name: str(L.name) || 'Customer',
      customer_email: L.email ? str(L.email).toLowerCase() : null,
      customer_phone: L.phone ? str(L.phone) : null,
      service_address: L.address ? str(L.address) : null,
      vehicle_description: L.vehicle ? str(L.vehicle) : null,
      service_slug: input.serviceSlug,
      vehicle_class: input.vehicleClass ?? 'standard',
      line_items: lineItems,
      subtotal_cents: subtotalCents,
      discount_cents: discountCents,
      total_cents: totalCents,
      deposit_cents: depositCents,
      scheduled_start: input.scheduledStart ?? null,
      notes: input.notes?.trim() || null,
      valid_until: validUntil,
      created_by: actorId,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };

  const estimate = mapRow(data as Record<string, unknown>);
  await admin.from('leads').update({ latest_estimate_id: estimate.id, updated_at: now }).eq('id', input.leadId);
  return { ok: true, estimate };
}

export async function sendEstimateToCustomer(
  admin: SupabaseClient,
  estimateId: string,
  origin?: string,
): Promise<{ ok: boolean; error?: string; estimate?: ServiceEstimate }> {
  const estimate = await loadEstimateById(admin, estimateId);
  if (!estimate) return { ok: false, error: 'Estimate not found' };
  if (!estimate.customerEmail) return { ok: false, error: 'Customer email required to send estimate.' };
  if (estimate.status !== 'draft' && estimate.status !== 'sent') {
    return { ok: false, error: `Cannot send estimate in status ${estimate.status}.` };
  }

  const url = estimatePublicUrl(estimate.accessToken, origin);
  const html = glossBossEmailLayout({
    title: 'Your Gloss Boss service estimate',
    bodyHtml:
      `<p style="color:#e4e4e7;font-size:15px;line-height:1.6">Hi ${estimate.customerName},</p>` +
      `<p style="color:#e4e4e7;font-size:15px;line-height:1.6">Your estimate total is <strong style="color:#d4af37">${displayMoney(estimate.totalCents)}</strong>` +
      ` with a deposit of <strong style="color:#d4af37">${displayMoney(estimate.depositCents)}</strong>.</p>` +
      (estimate.notes ? `<p style="color:#a1a1aa;font-size:13px">${estimate.notes}</p>` : '') +
      emailCtaButton(url, 'Review & approve estimate'),
  });

  const sent = await sendResendHtml({
    to: estimate.customerEmail,
    subject: `Your Gloss Boss estimate — ${displayMoney(estimate.totalCents)}`,
    html,
  });

  const now = new Date().toISOString();
  await admin.from('notification_outbox').insert({
    kind: 'estimate_sent',
    customer_id: estimate.customerId,
    channel: 'email',
    status: sent.ok ? 'sent' : 'failed',
    payload: { estimate_id: estimate.id, url, error: sent.error ?? null },
  });

  const { error } = await admin
    .from('service_estimates')
    .update({ status: 'sent', sent_at: now, updated_at: now })
    .eq('id', estimate.id);

  if (error) return { ok: false, error: error.message };

  if (estimate.leadId) {
    await admin.from('leads').update({ status: 'quoted', updated_at: now }).eq('id', estimate.leadId);
  }

  if (!sent.ok) return { ok: false, error: sent.error ?? 'Email failed', estimate: { ...estimate, status: 'sent', sentAt: now } };

  return { ok: true, estimate: { ...estimate, status: 'sent', sentAt: now } };
}

export async function sendEstimateSmsToCustomer(
  admin: SupabaseClient,
  estimateId: string,
  origin?: string,
): Promise<{ ok: boolean; error?: string }> {
  const estimate = await loadEstimateById(admin, estimateId);
  if (!estimate) return { ok: false, error: 'Estimate not found' };
  if (!estimate.customerPhone) return { ok: false, error: 'Customer phone required for SMS quote.' };

  const { sendCustomerSms } = await import('@/lib/sms-send');
  const body = buildEstimateSmsBody(estimate, origin);
  const sent = await sendCustomerSms({
    db: admin,
    to: estimate.customerPhone,
    body,
    kind: 'estimate_sent',
    customer_id: estimate.customerId,
    template_key: 'estimate_quote',
    requireConsent: false,
    extraPayload: { estimate_id: estimate.id, url: estimatePublicUrl(estimate.accessToken, origin) },
  });

  const now = new Date().toISOString();
  await admin.from('notification_outbox').insert({
    kind: 'estimate_sent_sms',
    customer_id: estimate.customerId,
    channel: 'sms',
    status: sent.ok ? 'sent' : sent.skipped ? 'skipped' : 'failed',
    payload: { estimate_id: estimate.id, body, error: sent.error ?? null, sid: sent.sid ?? null },
    created_at: now,
  });

  if (!sent.ok && !sent.skipped) return { ok: false, error: sent.error ?? 'SMS failed' };
  return { ok: true };
}

export async function approveEstimateByToken(admin: SupabaseClient, token: string): Promise<{ ok: boolean; error?: string; estimate?: ServiceEstimate }> {
  const estimate = await loadEstimateByToken(admin, token);
  if (!estimate) return { ok: false, error: 'Estimate not found' };
  if (estimate.status === 'declined') return { ok: false, error: 'Estimate was declined.' };
  if (estimate.status === 'approved' || estimate.status === 'deposit_paid' || estimate.status === 'converted') {
    return { ok: true, estimate };
  }
  if (estimate.status !== 'sent' && estimate.status !== 'draft') {
    return { ok: false, error: `Estimate cannot be approved from status ${estimate.status}.` };
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from('service_estimates')
    .update({ status: 'approved', approved_at: now, updated_at: now })
    .eq('id', estimate.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, estimate: { ...estimate, status: 'approved', approvedAt: now } };
}

export async function declineEstimateByToken(admin: SupabaseClient, token: string): Promise<{ ok: boolean; error?: string }> {
  const estimate = await loadEstimateByToken(admin, token);
  if (!estimate) return { ok: false, error: 'Estimate not found' };

  const now = new Date().toISOString();
  const { error } = await admin
    .from('service_estimates')
    .update({ status: 'declined', declined_at: now, updated_at: now })
    .eq('id', estimate.id);

  if (error) return { ok: false, error: error.message };
  if (estimate.leadId) {
    await admin.from('leads').update({ status: 'lost', updated_at: now }).eq('id', estimate.leadId);
  }
  return { ok: true };
}

async function ensureCustomerForEstimate(admin: SupabaseClient, estimate: ServiceEstimate): Promise<string | null> {
  if (estimate.customerId) return estimate.customerId;
  const email = str(estimate.customerEmail).toLowerCase();
  if (!email) return null;

  const { data: existing } = await admin.from('customers').select('id').eq('email', email).maybeSingle();
  if (existing?.id) return String(existing.id);

  const phone = str(estimate.customerPhone).replace(/\D/g, '').slice(0, 15) || null;
  const { data, error } = await admin
    .from('customers')
    .insert({ email, phone, full_name: estimate.customerName })
    .select('id')
    .single();
  if (error || !data) return null;
  return String(data.id);
}

export async function createAppointmentFromEstimate(
  admin: SupabaseClient,
  estimate: ServiceEstimate,
): Promise<{ ok: boolean; error?: string; appointmentId?: string; accessToken?: string }> {
  if (estimate.appointmentId) {
    const { data: appt } = await admin.from('appointments').select('id, access_token').eq('id', estimate.appointmentId).maybeSingle();
    if (appt?.id) {
      return { ok: true, appointmentId: String(appt.id), accessToken: str(appt.access_token) };
    }
  }

  const customerId = await ensureCustomerForEstimate(admin, estimate);
  const accessToken = randomBytes(24).toString('hex');
  const scheduledStart =
    estimate.scheduledStart ?? new Date(Date.now() + 7 * 86400000).toISOString();

  const { data, error } = await admin
    .from('appointments')
    .insert({
      customer_id: customerId,
      guest_name: estimate.customerName,
      guest_email: estimate.customerEmail,
      guest_phone: estimate.customerPhone,
      vehicle_description: estimate.vehicleDescription,
      service_slug: estimate.serviceSlug ?? 'detail',
      vehicle_class: estimate.vehicleClass ?? 'standard',
      base_price_cents: estimate.totalCents,
      deposit_amount_cents: estimate.depositCents,
      deposit_percent: estimate.totalCents > 0 ? Math.round((estimate.depositCents / estimate.totalCents) * 100) : 30,
      balance_due_cents: Math.max(0, estimate.totalCents - estimate.depositCents),
      service_address: estimate.serviceAddress,
      scheduled_start: scheduledStart,
      status: 'awaiting_payment',
      payment_status: 'awaiting_deposit',
      payment_choice: 'deposit',
      booking_source: 'estimate',
      access_token: accessToken,
      notes: estimate.notes,
    })
    .select('id, access_token')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Could not create work order' };

  const appointmentId = String(data.id);
  const now = new Date().toISOString();

  await admin
    .from('service_estimates')
    .update({
      appointment_id: appointmentId,
      customer_id: customerId,
      updated_at: now,
    })
    .eq('id', estimate.id);

  if (estimate.leadId) {
    await admin
      .from('leads')
      .update({ customer_id: customerId, status: 'booked', updated_at: now })
      .eq('id', estimate.leadId);
  }

  await recordJobTimelineEvent(admin, {
    appointmentId,
    eventType: 'intake_submitted',
    meta: { source: 'estimate', estimate_id: estimate.id },
  });

  return { ok: true, appointmentId, accessToken: str(data.access_token) || accessToken };
}

export async function startEstimateDepositCheckout(
  admin: SupabaseClient,
  token: string,
  origin: string,
): Promise<{ ok: boolean; error?: string; url?: string }> {
  let estimate = await loadEstimateByToken(admin, token);
  if (!estimate) return { ok: false, error: 'Estimate not found' };

  if (estimate.status === 'sent') {
    const approved = await approveEstimateByToken(admin, token);
    if (!approved.ok) return { ok: false, error: approved.error };
    estimate = approved.estimate!;
  }

  if (estimate.status !== 'approved' && estimate.status !== 'converted' && estimate.status !== 'deposit_paid') {
    return { ok: false, error: 'Estimate must be approved before paying deposit.' };
  }

  const appt = await createAppointmentFromEstimate(admin, estimate);
  if (!appt.ok || !appt.appointmentId || !appt.accessToken) {
    return { ok: false, error: appt.error ?? 'Could not prepare work order' };
  }

  const checkout = await createDepositCheckoutSession({
    admin,
    appointmentId: appt.appointmentId,
    accessToken: appt.accessToken,
    origin,
    paymentChoice: 'deposit',
  });

  if (!checkout.ok) return { ok: false, error: 'error' in checkout ? checkout.error : 'Checkout failed' };
  if ('skipPayment' in checkout && checkout.skipPayment) {
    const now = new Date().toISOString();
    await admin.from('service_estimates').update({ status: 'deposit_paid', deposit_paid_at: now, updated_at: now }).eq('access_token', token);
    return { ok: true, url: `${origin}/book/confirmed?appointment=${appt.appointmentId}` };
  }

  if ('url' in checkout && checkout.url) {
    return { ok: true, url: checkout.url };
  }
  return { ok: false, error: 'Checkout failed' };
}

export async function markEstimateDepositPaidForAppointment(admin: SupabaseClient, appointmentId: string) {
  const now = new Date().toISOString();
  const { data } = await admin
    .from('service_estimates')
    .select('id, lead_id')
    .eq('appointment_id', appointmentId)
    .in('status', ['approved', 'sent', 'converted'])
    .maybeSingle();
  if (!data?.id) return;

  await admin
    .from('service_estimates')
    .update({
      status: 'deposit_paid',
      deposit_paid_at: now,
      converted_at: now,
      updated_at: now,
    })
    .eq('id', data.id);

  if (data.lead_id) {
    await admin.from('leads').update({ status: 'booked', updated_at: now }).eq('id', data.lead_id);
  }
}

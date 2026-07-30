import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resendConfigured, sendResendHtml, sendTwilioSms } from '@/lib/email-send';
import { bookingConfirmationEmailHtml } from '@/lib/email/templates/booking';
import { paymentReceivedEmailHtml } from '@/lib/email/templates/transactional';
import { resolveJobPricing } from '@/lib/job-pricing-display';
import { vehiclesFromRow, type Row } from '@/lib/work-order-resolve';
import { customerCanReceiveSms } from '@/lib/sms-consent';
import { notifyOwnerBookingEvent } from '@/lib/owner-alerts';
import {
  buildCustomerPortalAccessUrl,
  ensurePortalAccessExpiry,
} from '@/lib/customer-portal-access';
import {
  markPortalLinkCreated,
  markPortalLinkSent,
} from '@/lib/confirmation-delivery-status';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function address(job: Row) {
  return [job.service_address, job.service_city, job.service_state, job.service_zip].map(str).filter(Boolean).join(', ');
}

function vehicleSummary(job: Row) {
  const vehicles = vehiclesFromRow(job);
  if (vehicles.length === 0) return str(job.vehicle_description) || 'Your vehicle(s)';
  return vehicles
    .map((vehicle, index) => str(vehicle.vehicle_description || vehicle.description) || `Vehicle ${index + 1}`)
    .join(' · ');
}

type OutboxInsert = {
  id?: string;
  appointment_id: string;
  customer_id?: string | null;
  kind: string;
  channel: string;
  status: string;
  provider?: string | null;
  provider_status?: string | null;
  provider_message_id?: string | null;
  skipped_reason?: string | null;
  error_message?: string | null;
  payload?: Record<string, unknown>;
  sent_at?: string | null;
  delivered_at?: string | null;
  failed_at?: string | null;
  status_updated_at?: string | null;
};

async function insertOutbox(admin: SupabaseClient, row: OutboxInsert) {
  const { error } = await admin.from('notification_outbox').insert(row);
  if (error) throw new Error(`Could not record customer delivery: ${error.message}`);
}

const ACCEPTED_DELIVERY = new Set(['accepted', 'queued', 'sending', 'sent', 'delivered']);

function acceptedDelivery(raw: unknown) {
  return ACCEPTED_DELIVERY.has(str(raw).toLowerCase());
}

function automaticConfirmationId(appointmentId: string, channel: 'email' | 'sms') {
  const hex = createHash('sha256')
    .update(`booking_confirmation:automatic_initial:${appointmentId}:${channel}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function hasAcceptedAutomaticConfirmation(
  admin: SupabaseClient,
  appointmentId: string,
  channel: 'email' | 'sms',
) {
  const { data, error } = await admin
    .from('notification_outbox')
    .select('status, provider_status, created_at')
    .eq('appointment_id', appointmentId)
    .eq('kind', 'booking_confirmation')
    .eq('channel', channel)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`Could not check existing ${channel} confirmation: ${error.message}`);

  const staleBefore = Date.now() - 10 * 60 * 1000;
  return (data ?? []).some((row) => {
    const status = str(row.provider_status || row.status).toLowerCase();
    if (!acceptedDelivery(status)) return false;
    if (status !== 'sending') return true;
    const createdAt = new Date(str(row.created_at)).getTime();
    return Number.isNaN(createdAt) || createdAt >= staleBefore;
  });
}

async function reserveAutomaticConfirmation(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    customerId: string | null;
    channel: 'email' | 'sms';
    payload: Record<string, unknown>;
  },
) {
  if (await hasAcceptedAutomaticConfirmation(admin, input.appointmentId, input.channel)) return null;

  const id = automaticConfirmationId(input.appointmentId, input.channel);
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await admin
    .from('notification_outbox')
    .select('id, status, provider_status, created_at')
    .eq('id', id)
    .maybeSingle();
  if (existingError) throw new Error(`Could not reserve ${input.channel} confirmation: ${existingError.message}`);

  if (existing) {
    const state = str(existing.provider_status || existing.status).toLowerCase();
    const createdAt = new Date(str(existing.created_at)).getTime();
    const activeReservation =
      state === 'sending' && (Number.isNaN(createdAt) || createdAt >= Date.now() - 10 * 60 * 1000);
    if (acceptedDelivery(state) && (state !== 'sending' || activeReservation)) return null;

    const retry = await admin
      .from('notification_outbox')
      .update({
        status: 'sending',
        provider_status: 'sending',
        error_message: null,
        skipped_reason: null,
        status_updated_at: now,
        payload: input.payload,
      })
      .eq('id', id)
      .eq('status', str(existing.status))
      .select('id')
      .maybeSingle();
    if (retry.error) throw new Error(`Could not retry ${input.channel} confirmation: ${retry.error.message}`);
    return retry.data?.id ? id : null;
  }

  const reserved = await admin.from('notification_outbox').insert({
    id,
    appointment_id: input.appointmentId,
    customer_id: input.customerId,
    kind: 'booking_confirmation',
    channel: input.channel,
    provider: input.channel === 'email' ? 'resend' : 'twilio',
    status: 'sending',
    provider_status: 'sending',
    status_updated_at: now,
    payload: input.payload,
    created_at: now,
  });
  if (reserved.error) {
    if (/duplicate|unique/i.test(reserved.error.message)) return null;
    throw new Error(`Could not reserve ${input.channel} confirmation: ${reserved.error.message}`);
  }
  return id;
}

async function finalizeReservedConfirmation(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
) {
  const { data, error } = await admin
    .from('notification_outbox')
    .update({ ...patch, status_updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error || !data?.id) {
    throw new Error(`Could not finalize customer delivery: ${error?.message ?? 'delivery record missing'}`);
  }
}

function receiptHtmlWithSecurePortal(html: string, portalUrl: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://glossbossatx.com').replace(/\/$/, '');
  return html
    .replaceAll(`${base}/dashboard`, portalUrl)
    .replaceAll('Open your dashboard', 'View my appointment');
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** After Stripe checkout succeeds — booking confirmation plus payment receipt. */
export async function notifyBookingCheckoutPaid(params: {
  admin: SupabaseClient;
  appointmentId: string;
  paidCents: number;
  paymentKind: 'deposit' | 'booking_full' | 'customer_final_balance' | 'field_full';
}): Promise<void> {
  const { admin, appointmentId, paidCents, paymentKind } = params;
  const { data: job, error: jobError } = await admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
  if (jobError) throw new Error(`Could not load booking for customer delivery: ${jobError.message}`);
  if (!job) throw new Error('Could not load booking for customer delivery: appointment not found.');

  const jobRow = job as Row;
  const customerId = str(jobRow.customer_id) || null;
  const email = str(jobRow.guest_email).toLowerCase();
  const phone = str(jobRow.guest_phone);
  const guestName = str(jobRow.guest_name) || 'there';
  const accessToken = str(jobRow.access_token);
  if (!accessToken) throw new Error('Could not send booking checkout messages: secure portal token is missing.');

  const whenIso = str(jobRow.scheduled_start) || new Date().toISOString();
  const portalUrl = buildCustomerPortalAccessUrl(appointmentId, accessToken);
  await ensurePortalAccessExpiry(admin, appointmentId, whenIso);
  await markPortalLinkCreated(admin, appointmentId);

  const whenLabel = new Date(whenIso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const serviceAddress = address(jobRow);
  const vehicles = vehicleSummary(jobRow);

  const { data: payments, error: paymentsError } = await admin
    .from('payments')
    .select('*')
    .eq('appointment_id', appointmentId)
    .order('paid_at', { ascending: false })
    .limit(20);
  if (paymentsError) throw new Error(`Could not load payment details for customer delivery: ${paymentsError.message}`);

  const pricing = resolveJobPricing(jobRow, (payments ?? []) as Row[]);
  const totalCents = pricing.finalTotalCents;
  const depositCents = pricing.depositCents;
  const remainingCents = pricing.remainingBalanceCents;
  const isDeposit = paymentKind === 'deposit';
  const isFull = paymentKind !== 'deposit';
  const isInitialConfirmation = isDeposit || paymentKind === 'booking_full';
  const deliveryErrors: string[] = [];
  let portalLinkAccepted = false;
  if (!email.includes('@') && phone.replace(/\D/g, '').length < 10) {
    deliveryErrors.push('No deliverable customer email or phone is attached to this booking.');
  }

  if (email.includes('@')) {
    if (isInitialConfirmation) {
      try {
        const confirmationHtml = bookingConfirmationEmailHtml({
          guestName,
          whenLabel,
          total: money(totalCents),
          deposit: money(depositCents),
          vehicles,
          serviceAddress,
          remainingBalance: money(remainingCents),
          portalUrl,
        });
        const reservationId = await reserveAutomaticConfirmation(admin, {
          appointmentId,
          customerId,
          channel: 'email',
          payload: {
            to: email,
            paid_cents: paidCents,
            portal_url: portalUrl,
            automatic_initial: true,
          },
        });
        if (reservationId) {
          const now = new Date().toISOString();
          if (!resendConfigured()) {
            const message = 'Resend not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).';
            await finalizeReservedConfirmation(admin, reservationId, {
              status: 'failed',
              provider_status: 'failed',
              error_message: message,
              failed_at: now,
            });
            deliveryErrors.push(`Confirmation email: ${message}`);
          } else {
            const sent = await sendResendHtml({
              to: email,
              subject: 'Gloss Boss ATX — Booking confirmed',
              html: confirmationHtml,
            });
            await finalizeReservedConfirmation(admin, reservationId, {
              status: sent.ok ? 'queued' : 'failed',
              provider_status: sent.ok ? 'queued' : 'failed',
              provider_message_id: sent.ok ? sent.emailId ?? null : null,
              error_message: sent.ok ? null : sent.error ?? 'Resend failed.',
              sent_at: sent.ok ? now : null,
              failed_at: sent.ok ? null : now,
            });
            if (sent.ok) portalLinkAccepted = true;
            else deliveryErrors.push(`Confirmation email: ${sent.error ?? 'Resend failed.'}`);
          }
        }
      } catch (error) {
        deliveryErrors.push(errorText(error, 'Confirmation email delivery failed.'));
      }
    }

    const receiptLabel = isFull ? 'Payment receipt' : 'Deposit receipt';
    const receiptHtml = receiptHtmlWithSecurePortal(
      paymentReceivedEmailHtml({
        guestName,
        whenLabel,
        paid: money(paidCents),
        total: money(totalCents),
        remainingBalance: money(remainingCents),
        serviceAddress,
        vehicles,
        kindLabel: receiptLabel,
      }),
      portalUrl,
    );
    try {
      const now = new Date().toISOString();
      if (!resendConfigured()) {
        const message = 'Resend not configured.';
        await insertOutbox(admin, {
          appointment_id: appointmentId,
          customer_id: customerId,
          kind: isDeposit ? 'deposit_receipt' : 'payment_receipt',
          channel: 'email',
          provider: 'resend',
          status: 'failed',
          provider_status: 'failed',
          error_message: message,
          payload: { to: email, portal_url: portalUrl },
          failed_at: now,
          status_updated_at: now,
        });
        deliveryErrors.push(`${receiptLabel}: ${message}`);
      } else {
        const sent = await sendResendHtml({
          to: email,
          subject: `Gloss Boss ATX — ${receiptLabel}`,
          html: receiptHtml,
        });
        await insertOutbox(admin, {
          appointment_id: appointmentId,
          customer_id: customerId,
          kind: isDeposit ? 'deposit_receipt' : 'payment_receipt',
          channel: 'email',
          provider: 'resend',
          status: sent.ok ? 'queued' : 'failed',
          provider_status: sent.ok ? 'queued' : 'failed',
          provider_message_id: sent.ok ? sent.emailId ?? null : null,
          error_message: sent.ok ? null : sent.error ?? 'Resend failed.',
          payload: { to: email, amount_cents: paidCents, portal_url: portalUrl },
          sent_at: sent.ok ? now : null,
          failed_at: sent.ok ? null : now,
          status_updated_at: now,
        });
        if (sent.ok) portalLinkAccepted = true;
        else deliveryErrors.push(`${receiptLabel}: ${sent.error ?? 'Resend failed.'}`);
      }
    } catch (error) {
      deliveryErrors.push(errorText(error, `${receiptLabel} delivery failed.`));
    }
  }

  if (phone.replace(/\D/g, '').length >= 10) {
    try {
      const kind = isInitialConfirmation ? 'booking_confirmation' : 'payment_receipt';
      const reservationId = isInitialConfirmation
        ? await reserveAutomaticConfirmation(admin, {
          appointmentId,
          customerId,
          channel: 'sms',
          payload: {
            to: phone,
            paid_cents: paidCents,
            portal_url: portalUrl,
            automatic_initial: true,
          },
        })
        : null;

      if (!isInitialConfirmation || reservationId) {
        const now = new Date().toISOString();
        const consent = await customerCanReceiveSms(admin, {
          appointmentId,
          customerId,
          phone,
        });
        if (!consent.ok) {
          const skipped = {
            status: 'skipped',
            provider_status: 'skipped',
            skipped_reason: consent.reason ?? 'SMS consent is not opted in.',
          };
          if (reservationId) {
            await finalizeReservedConfirmation(admin, reservationId, skipped);
          } else {
            await insertOutbox(admin, {
              appointment_id: appointmentId,
              customer_id: customerId,
              kind,
              channel: 'sms',
              provider: 'twilio',
              ...skipped,
              payload: { to: phone, portal_url: portalUrl },
              status_updated_at: now,
            });
          }
        } else {
          const smsBody =
            `Gloss Boss ATX: ${isInitialConfirmation ? 'Booking confirmed' : 'Payment received'} for ${whenLabel}. ` +
            `Paid ${money(paidCents)}. Balance ${money(remainingCents)}. ` +
            `View or manage your appointment: ${portalUrl} Questions? info@glossbossatx.com`;
          const sent = await sendTwilioSms({ to: phone, body: smsBody });
          const rawStatus = str(sent.status || (sent.ok ? 'queued' : 'failed')).toLowerCase();
          const status =
            rawStatus === 'delivered'
              ? 'delivered'
              : rawStatus === 'sent'
                ? 'sent'
                : sent.ok && !['failed', 'undelivered'].includes(rawStatus)
                  ? 'queued'
                  : rawStatus === 'undelivered'
                    ? 'undelivered'
                    : 'failed';
          const accepted = ['queued', 'sent', 'delivered'].includes(status);
          const deliveryPatch = {
            status,
            provider_status: rawStatus,
            provider_message_id: sent.sid ?? null,
            error_message: accepted ? null : sent.errorMessage ?? sent.error ?? 'Twilio send failed.',
            sent_at: accepted ? now : null,
            delivered_at: status === 'delivered' ? now : null,
            failed_at: accepted ? null : now,
            payload: {
              to: phone,
              paid_cents: paidCents,
              portal_url: portalUrl,
              body_preview: smsBody.slice(0, 160),
              twilio_sid: sent.sid ?? null,
            },
          };
          if (reservationId) {
            await finalizeReservedConfirmation(admin, reservationId, deliveryPatch);
          } else {
            await insertOutbox(admin, {
              appointment_id: appointmentId,
              customer_id: customerId,
              kind,
              channel: 'sms',
              provider: 'twilio',
              ...deliveryPatch,
              status_updated_at: now,
            });
          }
          if (accepted) portalLinkAccepted = true;
          else deliveryErrors.push(`Customer SMS: ${sent.errorMessage ?? sent.error ?? 'Twilio send failed.'}`);
        }
      }
    } catch (error) {
      deliveryErrors.push(errorText(error, 'Customer SMS delivery failed.'));
    }
  }

  if (portalLinkAccepted) {
    try {
      await markPortalLinkSent(admin, appointmentId);
    } catch (error) {
      deliveryErrors.push(errorText(error, 'Could not record secure portal-link delivery.'));
    }
  }

  try {
    await notifyOwnerBookingEvent({
      kind: isFull ? 'paid_full' : 'deposit_paid',
      appointmentId,
      guestName,
      guestEmail: email,
      guestPhone: phone,
      whenIso,
      totalCents,
      depositCents,
      balanceCents: remainingCents,
      paidCents,
      vehicles,
      serviceAddress,
    });
  } catch (error) {
    console.warn('[booking-checkout-notify] owner alert', error);
  }

  if (isInitialConfirmation) {
    try {
      const { enqueueAgreementReminderCadence } = await import('@/lib/agreements/reminders');
      await enqueueAgreementReminderCadence(admin, {
        appointmentId,
        customerId,
        scheduledStart: whenIso,
        accessToken,
      });
    } catch (error) {
      console.warn('[booking-checkout-notify] agreement reminders skipped', error);
    }
  }

  if (deliveryErrors.length > 0) {
    throw new Error(`Customer delivery needs attention: ${deliveryErrors.join(' | ')}`);
  }
}

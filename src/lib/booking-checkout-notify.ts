import type { SupabaseClient } from '@supabase/supabase-js';
import { resendConfigured, sendBookingConfirmationEmailIfConfigured, sendResendHtml } from '@/lib/email-send';
import { bookingConfirmationEmailHtml } from '@/lib/email/templates/booking';
import { paymentReceivedEmailHtml } from '@/lib/email/templates/transactional';
import { resolveJobPricing } from '@/lib/job-pricing-display';
import { vehiclesFromRow, type Row } from '@/lib/work-order-resolve';
import { sendCustomerSms } from '@/lib/sms-send';
import { notifyOwnerBookingEvent } from '@/lib/owner-alerts';

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
    .map((v, i) => str(v.vehicle_description || v.description) || `Vehicle ${i + 1}`)
    .join(' · ');
}

async function insertOutbox(
  admin: SupabaseClient,
  row: {
    appointment_id: string;
    customer_id?: string | null;
    kind: string;
    channel: string;
    status: string;
    skipped_reason?: string | null;
    error_message?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  try {
    await admin.from('notification_outbox').insert(row);
  } catch (e) {
    console.warn('[booking-checkout-notify] outbox', e);
  }
}

/** After Stripe checkout succeeds — booking confirmation + deposit/payment receipt via Resend (not Supabase auth). */
export async function notifyBookingCheckoutPaid(params: {
  admin: SupabaseClient;
  appointmentId: string;
  paidCents: number;
  paymentKind: 'deposit' | 'booking_full' | 'customer_final_balance' | 'field_full';
}): Promise<void> {
  const { admin, appointmentId, paidCents, paymentKind } = params;
  const { data: job } = await admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
  if (!job) return;

  const jobRow = job as Row;
  const email = str(jobRow.guest_email).toLowerCase();
  const phone = str(jobRow.guest_phone);
  const guestName = str(jobRow.guest_name) || 'there';
  const whenIso = str(jobRow.scheduled_start) || new Date().toISOString();
  const whenLabel = new Date(whenIso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const addr = address(jobRow);
  const vehicles = vehicleSummary(jobRow);

  const { data: payments } = await admin
    .from('payments')
    .select('*')
    .eq('appointment_id', appointmentId)
    .order('paid_at', { ascending: false })
    .limit(20);
  const pricing = resolveJobPricing(jobRow, (payments ?? []) as Row[]);
  const totalCents = pricing.finalTotalCents;
  const depositCents = pricing.depositCents;
  const remainingCents = pricing.remainingBalanceCents;

  const isDeposit = paymentKind === 'deposit';
  const isFull = paymentKind === 'booking_full' || paymentKind === 'customer_final_balance' || paymentKind === 'field_full';

  if (email.includes('@')) {
    if (isDeposit || isFull) {
      const confirmHtml = bookingConfirmationEmailHtml({
        guestName,
        whenLabel,
        total: money(totalCents),
        deposit: money(depositCents),
        vehicles,
        serviceAddress: addr,
        remainingBalance: money(remainingCents),
      });
      if (resendConfigured()) {
        const sent = await sendResendHtml({
          to: email,
          subject: 'Gloss Boss ATX — Booking confirmed',
          html: confirmHtml,
        });
        await insertOutbox(admin, {
          appointment_id: appointmentId,
          customer_id: str(jobRow.customer_id) || null,
          kind: 'booking_confirmation',
          channel: 'email',
          status: sent.ok ? 'sent' : 'failed',
          error_message: sent.ok ? null : sent.error ?? 'Resend failed',
          payload: { to: email, paid_cents: paidCents },
        });
      } else {
        await insertOutbox(admin, {
          appointment_id: appointmentId,
          kind: 'booking_confirmation',
          channel: 'email',
          status: 'skipped',
          skipped_reason: 'Resend not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).',
          payload: { to: email },
        });
      }
    }

    const receiptLabel = isFull ? 'Payment receipt' : 'Deposit receipt';
    const receiptHtml = paymentReceivedEmailHtml({
      guestName,
      whenLabel,
      paid: money(paidCents),
      total: money(totalCents),
      remainingBalance: money(remainingCents),
      serviceAddress: addr,
      vehicles,
      kindLabel: receiptLabel,
    });
    if (resendConfigured()) {
      const sent = await sendResendHtml({
        to: email,
        subject: `Gloss Boss ATX — ${receiptLabel}`,
        html: receiptHtml,
      });
      await insertOutbox(admin, {
        appointment_id: appointmentId,
        customer_id: str(jobRow.customer_id) || null,
        kind: isDeposit ? 'deposit_receipt' : 'payment_receipt',
        channel: 'email',
        status: sent.ok ? 'sent' : 'failed',
        error_message: sent.ok ? null : sent.error ?? 'Resend failed',
        payload: { to: email, amount_cents: paidCents },
      });
    } else {
      await insertOutbox(admin, {
        appointment_id: appointmentId,
        kind: isDeposit ? 'deposit_receipt' : 'payment_receipt',
        channel: 'email',
        status: 'skipped',
        skipped_reason: 'Resend not configured.',
        payload: { to: email },
      });
    }
  }

  if (phone.replace(/\D/g, '').length >= 10) {
    try {
      await sendCustomerSms({
        db: admin,
        kind: isDeposit ? 'booking_confirmation' : 'payment_receipt',
        template_key: isDeposit ? 'booking_confirmation' : 'payment_receipt',
        to: phone,
        appointment_id: appointmentId,
        customer_id: str(jobRow.customer_id) || null,
        body: `Gloss Boss ATX: ${isDeposit ? 'Booking confirmed' : 'Payment received'} for ${whenLabel}. Paid ${money(paidCents)}. Balance ${money(remainingCents)}. Questions? info@glossbossatx.com`,
        extraPayload: { guest_name: guestName },
      });
    } catch (e) {
      console.warn('[booking-checkout-notify] sms', e);
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
      paidCents: paidCents,
      vehicles,
      serviceAddress: addr,
    });
  } catch (e) {
    console.warn('[booking-checkout-notify] owner alert', e);
  }

  if (isDeposit || paymentKind === 'booking_full') {
    try {
      const { enqueueAgreementReminderCadence } = await import('@/lib/agreements/reminders');
      await enqueueAgreementReminderCadence(admin, {
        appointmentId,
        customerId: str(jobRow.customer_id) || null,
        scheduledStart: whenIso,
        accessToken: str(jobRow.access_token) || null,
      });
    } catch (e) {
      console.warn('[booking-checkout-notify] agreement reminders skipped', e);
    }
  }
}

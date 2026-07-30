const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(__dirname, '..');
for (const file of ['.env.production', '.env.local']) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) continue;
  for (const rawLine of fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    if (!process.env[key] && value) process.env[key] = value;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = (process.env.QA_PRODUCTION_URL || 'https://www.glossbossatx.com').replace(/\/$/, '');
if (!url || !serviceKey) process.exit(1);
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const token = randomBytes(24).toString('hex');
  const scheduledStart = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000).toISOString();
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  let appointmentId = '';
  let paymentId = '';
  let messageId = '';

  try {
    const appointment = await admin.from('appointments').insert({
      guest_name: '[QA] Cancellation Reliability',
      guest_email: null,
      guest_phone: null,
      access_token: token,
      status: 'confirmed',
      lifecycle_stage: 'scheduled',
      payment_status: 'deposit_paid',
      payment_choice: 'deposit',
      booking_vehicles: [{
        vehicle_description: 'Cancellation QA Vehicle',
        service_slug: 'full-detail',
        vehicle_class: 'sedan',
        price_cents: 13000,
      }],
      vehicle_description: 'Cancellation QA Vehicle',
      service_slug: 'full-detail',
      vehicle_class: 'sedan',
      base_price_cents: 13000,
      deposit_amount_cents: 3900,
      balance_due_cents: 9100,
      scheduled_start: scheduledStart,
      estimated_duration_minutes: 180,
      estimated_end: new Date(new Date(scheduledStart).getTime() + 180 * 60 * 1000).toISOString(),
      is_test: true,
      exclude_from_automations: true,
      exclude_from_customer_communications: true,
      qa_expires_at: expires,
    }).select('id').maybeSingle();
    if (appointment.error || !appointment.data?.id) {
      throw new Error(appointment.error?.message || 'Cancellation QA appointment creation failed.');
    }
    appointmentId = String(appointment.data.id);

    const payment = await admin.from('payments').insert({
      appointment_id: appointmentId,
      amount_cents: 3900,
      applied_amount_cents: 3900,
      status: 'succeeded',
      payment_method: 'external_card',
      payment_kind: 'deposit',
      provider: 'external',
      paid_at: new Date().toISOString(),
      is_test: true,
    }).select('id').maybeSingle();
    if (payment.error || !payment.data?.id) throw new Error(payment.error?.message || 'Cancellation QA payment failed.');
    paymentId = String(payment.data.id);

    const block = await admin.from('booking_availability_blocks').insert({
      title: '[QA] Cancellation block',
      start_at: scheduledStart,
      end_at: new Date(new Date(scheduledStart).getTime() + 180 * 60 * 1000).toISOString(),
      blocks_booking: true,
      source: 'titan_appointment',
      appointment_id: appointmentId,
    });
    if (block.error) throw new Error(block.error.message);

    const message = await admin.from('scheduled_messages').insert({
      rule_key: `qa-cancel-${suffix}`,
      appointment_id: appointmentId,
      channel: 'sms',
      recipient: '+15125550199',
      body: 'QA cancellation reminder. Do not send.',
      status: 'scheduled',
      scheduled_for: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      metadata: { qa: true },
    }).select('id').maybeSingle();
    if (message.error || !message.data?.id) throw new Error(message.error?.message || 'Cancellation QA reminder failed.');
    messageId = String(message.data.id);

    const endpoint = `${appUrl}/api/public/appointment-lifecycle`;
    const cancel = (accessToken = token) => fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', appointmentId, token: accessToken }),
    });

    let response = await cancel('wrong-token');
    assert(response.status === 403, 'Invalid secure token was accepted for cancellation.');

    response = await cancel();
    let body = await response.json();
    assert(response.ok && body.ok, `Valid cancellation failed: ${body.error || response.status}`);
    assert(body.appointmentStatus === 'cancelled' && body.appointmentActive === false, 'Cancellation response did not expose inactive state.');
    assert(body.refundDecision === 'review_required', 'Paid cancellation did not expose payment review.');

    const firstEvents = await admin.from('work_order_transition_events')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', appointmentId)
      .eq('to_stage', 'cancelled');
    response = await cancel();
    body = await response.json();
    assert(response.ok && body.ok && body.alreadyCancelled, 'Cancellation retry was not idempotent.');
    const secondEvents = await admin.from('work_order_transition_events')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', appointmentId)
      .eq('to_stage', 'cancelled');
    assert((firstEvents.count || 0) === (secondEvents.count || 0), 'Cancellation retry duplicated transition events.');

    const cancelled = await admin.from('appointments')
      .select('status, lifecycle_stage, balance_due_cents, payment_status, cancelled_at, cancellation_completed_at, cancellation_refund_decision')
      .eq('id', appointmentId)
      .maybeSingle();
    assert(cancelled.data?.status === 'cancelled' && cancelled.data?.lifecycle_stage === 'cancelled', 'Work order did not become cancelled.');
    assert(Number(cancelled.data?.balance_due_cents) === 0, 'Cancelled work order retained an outstanding balance.');
    assert(cancelled.data?.payment_status === 'deposit_paid', 'Cancellation erased the collected-payment state.');
    assert(cancelled.data?.cancelled_at && cancelled.data?.cancellation_completed_at, 'Cancellation audit timestamps were missing.');
    assert(cancelled.data?.cancellation_refund_decision === 'review_required', 'Cancellation refund decision was not durable.');

    const paymentAfter = await admin.from('payments').select('status, amount_cents').eq('id', paymentId).maybeSingle();
    assert(paymentAfter.data?.status === 'succeeded' && Number(paymentAfter.data?.amount_cents) === 3900, 'Cancellation altered payment history.');
    const reminder = await admin.from('scheduled_messages').select('status, skipped_reason').eq('id', messageId).maybeSingle();
    assert(
      ['cancelled', 'canceled'].includes(String(reminder.data?.status)) &&
        reminder.data?.skipped_reason === 'appointment_cancelled',
      'Pending appointment reminder was not cancelled.',
    );
    const blockAfter = await admin.from('booking_availability_blocks')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', appointmentId);
    assert((blockAfter.count || 0) === 0, 'Cancelled appointment retained an availability block.');

    const summaryResponse = await fetch(
      `${appUrl}/api/public/booking-confirmation?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
    const summary = await summaryResponse.json();
    assert(
      summaryResponse.ok &&
        summary.sessionState?.nextStep === 'inactive' &&
        summary.sessionState?.cancelled === true &&
        summary.sessionState?.canCancel === false &&
        summary.sessionState?.canReschedule === false,
      'Customer booking state did not become visibly cancelled.',
    );

    const slotsResponse = await fetch(
      `${appUrl}/api/public/booked-slots?from=${encodeURIComponent(new Date(new Date(scheduledStart).getTime() - 60_000).toISOString())}&to=${encodeURIComponent(new Date(new Date(scheduledStart).getTime() + 24 * 60 * 60 * 1000).toISOString())}`,
      { cache: 'no-store' },
    );
    const slots = await slotsResponse.json();
    assert(
      !Array.isArray(slots.blocks) || !slots.blocks.some((entry) => entry.appointmentId === appointmentId),
      'Cancelled appointment still blocked the public calendar.',
    );

    console.log(
      'Appointment cancellation production QA passed: secure-token rejection, durable cancelled work-order state, zero receivable with preserved payment history, refund-review visibility, reminder cancellation, slot release, customer inactive state, and idempotent retry.',
    );
  } finally {
    if (appointmentId) {
      await admin.from('work_order_transition_events').delete().eq('appointment_id', appointmentId);
      await admin.from('notification_outbox').delete().eq('appointment_id', appointmentId);
      await admin.from('booking_availability_blocks').delete().eq('appointment_id', appointmentId);
      await admin.from('google_calendar_sync_jobs').delete().eq('appointment_id', appointmentId);
    }
    if (messageId) await admin.from('scheduled_messages').delete().eq('id', messageId);
    if (paymentId) await admin.from('payments').delete().eq('id', paymentId);
    if (appointmentId) await admin.from('appointments').delete().eq('id', appointmentId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import { loadOrderSnapshot } from '@/lib/order-snapshot-engine';

function cents(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export async function applyPaymentRefundState(
  admin: SupabaseClient,
  input: {
    paymentId?: string | null;
    stripePaymentIntentId?: string | null;
    refundedTotalCents: number;
    occurredAt?: string | null;
  },
) {
  let query = admin
    .from('payments')
    .select('id, appointment_id, fallback_booking_id, amount_cents, refunded_amount_cents');
  query = input.paymentId
    ? query.eq('id', input.paymentId)
    : query.eq('stripe_payment_intent_id', input.stripePaymentIntentId ?? '');
  const payment = await query.limit(1).maybeSingle();
  if (payment.error || !payment.data?.id) {
    return { ok: false as const, error: payment.error?.message ?? 'Payment not found' };
  }

  const originalCents = cents(payment.data.amount_cents);
  const refundedTotalCents = Math.min(originalCents, cents(input.refundedTotalCents));
  if (refundedTotalCents <= 0) return { ok: false as const, error: 'Refund amount must be greater than zero' };
  const fullyRefunded = refundedTotalCents >= originalCents;
  const occurredAt = input.occurredAt || new Date().toISOString();
  let update = await admin
    .from('payments')
    .update({
      refunded_amount_cents: refundedTotalCents,
      refunded_at: fullyRefunded ? occurredAt : null,
      status: fullyRefunded ? 'refunded' : 'partially_refunded',
      updated_at: new Date().toISOString(),
    })
    .eq('id', payment.data.id);
  if (update.error && isSchemaDriftError(update.error.message)) {
    update = await admin
      .from('payments')
      .update({
        refunded_amount_cents: refundedTotalCents,
        status: fullyRefunded ? 'refunded' : 'partially_refunded',
      })
      .eq('id', payment.data.id);
  }
  if (update.error) return { ok: false as const, error: update.error.message };

  const appointmentId = String(payment.data.appointment_id ?? '');
  const fallbackBookingId = String(payment.data.fallback_booking_id ?? '');
  const snapshot = appointmentId
    ? await loadOrderSnapshot(admin, { appointmentId })
    : fallbackBookingId
      ? await loadOrderSnapshot(admin, { fallbackBookingId })
      : null;
  if (snapshot) {
    const table = appointmentId ? 'appointments' : 'booking_fallbacks';
    const jobId = appointmentId || fallbackBookingId;
    const netPaidCents = snapshot.pricing.totalPaidCents;
    const jobPaymentStatus = netPaidCents <= 0 ? 'refunded' : 'partially_refunded';
    const jobUpdate = await admin
      .from(table)
      .update({
        payment_status: jobPaymentStatus,
        balance_due_cents: snapshot.pricing.remainingBalanceCents,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    if (jobUpdate.error) return { ok: false as const, error: jobUpdate.error.message };
  }

  return {
    ok: true as const,
    paymentId: String(payment.data.id),
    refundedTotalCents,
    fullyRefunded,
    appointmentId: appointmentId || null,
    fallbackBookingId: fallbackBookingId || null,
  };
}

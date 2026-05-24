import type { SupabaseClient } from '@supabase/supabase-js';

export type PaymentDebugEventInput = {
  appointmentId?: string | null;
  fallbackBookingId?: string | null;
  customerEmail?: string | null;
  eventType: string;
  paymentMode?: 'deposit' | 'full' | 'pay_later' | string;
  stripeMode?: 'live' | 'test' | 'missing' | string;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

/** Server-side payment diagnostics — logs to console and persists when admin client is available. */
export async function logPaymentDebugEvent(
  admin: SupabaseClient | null,
  input: PaymentDebugEventInput,
): Promise<void> {
  const row = {
    appointment_id: input.appointmentId || null,
    fallback_booking_id: input.fallbackBookingId || null,
    customer_email: str(input.customerEmail) || null,
    event_type: input.eventType,
    payment_mode: input.paymentMode ?? null,
    stripe_mode: input.stripeMode ?? null,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ? String(input.errorMessage).slice(0, 2000) : null,
    metadata: input.metadata ?? {},
  };

  console.info('[payment-debug]', {
    event: input.eventType,
    appointmentId: input.appointmentId,
    fallbackBookingId: input.fallbackBookingId,
    email: input.customerEmail,
    paymentMode: input.paymentMode,
    code: input.errorCode,
    message: input.errorMessage,
  });

  if (!admin) return;

  const { error } = await admin.from('payment_debug_events').insert(row);
  if (error) {
    console.warn('[payment-debug] insert failed', error.message);
  }
}

import { notifyBusinessNewBookingFull, type OwnerBookingEventKind } from '@/lib/business-booking-notify';

export type { OwnerBookingEventKind };

/** Branded owner email/SMS + notification_outbox for all shop-facing booking events. */
export async function notifyOwnerBookingEvent(params: {
  kind: OwnerBookingEventKind;
  appointmentId?: string | null;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  whenIso?: string;
  totalCents?: number;
  depositCents?: number;
  balanceCents?: number;
  paidCents?: number;
  vehicles?: string;
  serviceAddress?: string;
  extraNote?: string;
}): Promise<void> {
  const appointmentId = params.appointmentId?.trim();
  if (!appointmentId && params.kind !== 'gift_card' && params.kind !== 'quote_request' && params.kind !== 'ceramic_quote') {
    console.warn('[owner-alerts] missing appointmentId for', params.kind);
  }
  const id = appointmentId ?? '00000000-0000-0000-0000-000000000000';
  await notifyBusinessNewBookingFull({
    eventKind: params.kind,
    guestName: params.guestName?.trim() || 'Customer',
    guestEmail: params.guestEmail?.trim() || '—',
    guestPhone: params.guestPhone?.trim() || '—',
    whenIso: params.whenIso ?? new Date().toISOString(),
    totalCents: params.totalCents ?? 0,
    depositCents: params.depositCents ?? 0,
    balanceCents: params.balanceCents,
    paidCents: params.paidCents,
    appointmentId: id,
    vehicles: params.vehicles?.trim() || '—',
    serviceAddress: params.serviceAddress ?? null,
    comped: params.kind === 'free_booking',
    extraNote: params.extraNote ?? null,
  });
}

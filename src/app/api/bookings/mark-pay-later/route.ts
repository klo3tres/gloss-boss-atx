import { NextResponse } from 'next/server';
import { logPaymentDebugEvent } from '@/lib/payment-debug';
import { notifyBusinessNewBookingQueued } from '@/lib/notifications-placeholder';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      appointmentId?: string;
      fallbackBookingId?: string;
      accessToken?: string;
      paymentChoice?: 'deposit' | 'full';
    };

    const appointmentId = body.appointmentId?.trim();
    const fallbackBookingId = body.fallbackBookingId?.trim();
    const accessToken = body.accessToken?.trim();
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 400 });
    }
    if (!appointmentId && !fallbackBookingId) {
      return NextResponse.json({ error: 'Missing booking id' }, { status: 400 });
    }

    const admin = tryCreateAdminSupabase();
    if (!admin) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    if (fallbackBookingId) {
      const { data: fb, error } = await admin
        .from('booking_fallbacks')
        .select('id, access_token, guest_email, guest_name, guest_phone, scheduled_start, base_price_cents, deposit_amount_cents')
        .eq('id', fallbackBookingId)
        .maybeSingle();
      if (error || !fb || fb.access_token !== accessToken) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }
      await admin
        .from('booking_fallbacks')
        .update({
          payment_status: 'pay_later',
          status: 'awaiting_payment',
          updated_at: new Date().toISOString(),
        })
        .eq('id', fallbackBookingId);

      await logPaymentDebugEvent(admin, {
        fallbackBookingId,
        customerEmail: fb.guest_email,
        eventType: 'pay_later_selected',
        paymentMode: body.paymentChoice ?? 'deposit',
      });

      return NextResponse.json({
        ok: true,
        fallbackBookingId,
        accessToken,
        redirectUrl: `/book/pending?fallback_booking_id=${encodeURIComponent(fallbackBookingId)}&token=${encodeURIComponent(accessToken)}&pay_later=1`,
      });
    }

    const { data: appt, error } = await admin
      .from('appointments')
      .select(
        'id, access_token, guest_email, guest_name, guest_phone, scheduled_start, base_price_cents, deposit_amount_cents, balance_due_cents, payment_choice',
      )
      .eq('id', appointmentId)
      .maybeSingle();

    if (error || !appt || appt.access_token !== accessToken) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    await admin
      .from('appointments')
      .update({
        status: 'awaiting_payment',
        payment_status: 'pay_later',
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId);

    await logPaymentDebugEvent(admin, {
      appointmentId,
      customerEmail: appt.guest_email,
      eventType: 'pay_later_selected',
      paymentMode: body.paymentChoice ?? appt.payment_choice ?? 'deposit',
    });

    void notifyBusinessNewBookingQueued({
      guestName: String(appt.guest_name ?? 'Customer'),
      guestEmail: String(appt.guest_email ?? ''),
      guestPhone: String(appt.guest_phone ?? ''),
      whenIso: String(appt.scheduled_start ?? new Date().toISOString()),
      totalCents: typeof appt.base_price_cents === 'number' ? appt.base_price_cents : 0,
      depositCents: typeof appt.deposit_amount_cents === 'number' ? appt.deposit_amount_cents : 0,
      appointmentId: appointmentId!,
      vehicles: 'Pay later — payment link pending',
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      appointmentId,
      accessToken,
      redirectUrl: `/book/pending?appointment_id=${encodeURIComponent(appointmentId!)}&token=${encodeURIComponent(accessToken)}&pay_later=1`,
    });
  } catch (e) {
    console.error('[api/bookings/mark-pay-later]', e);
    return NextResponse.json({ error: 'Could not save pay-later status' }, { status: 500 });
  }
}

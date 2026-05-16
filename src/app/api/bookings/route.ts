import { NextResponse } from 'next/server';
import {
  logBookingError,
  recordBookingFailure,
  recordBookingSuccess,
  saveBookingFallback,
} from '@/lib/booking-diagnostics';
import { isBookingSlotAllowed } from '@/lib/booking-availability';
import {
  computeQuoteFromInputs,
  insertAppointmentResilient,
  loadBookingAvailabilityRules,
  type VehicleLineInput,
} from '@/lib/booking-server-shared';
import { normalizeVehicleClass } from '@/lib/vehicle-pricing';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { normalizeUsPhone10Digits } from '@/lib/us-phone';
import { notifyBookingConfirmationQueued, notifyBusinessNewBookingQueued } from '@/lib/notifications-placeholder';

type Body = {
  serviceSlug?: string;
  vehicleClass?: string;
  vehicles?: VehicleLineInput[];
  addOns?: string[];
  offerId?: string;
  scheduledStart: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  vehicleDescription?: string;
  serviceAddress?: string;
  serviceCity?: string;
  serviceState?: string;
  serviceZip?: string;
  serviceAddressNotes?: string;
  promoCode?: string;
  notes?: string;
};

const ALLOWED_CLASS = new Set(['sedan', 'suv_truck']);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const { scheduledStart, guestName, guestEmail, guestPhone, notes } = body;
    const serviceAddress = String(body.serviceAddress ?? '').trim();
    const serviceCity = String(body.serviceCity ?? '').trim();
    const serviceState = String(body.serviceState ?? 'TX').trim().toUpperCase();
    const serviceZip = String(body.serviceZip ?? '').replace(/\D/g, '').slice(0, 5);
    const serviceAddressNotes = String(body.serviceAddressNotes ?? '').trim();
    const promoCode = String(body.promoCode ?? '').trim().toUpperCase();
    const addOns = Array.isArray(body.addOns)
      ? body.addOns
          .map((a) => String(a ?? '').trim())
          .filter(Boolean)
          .slice(0, 12)
          .map((s) => s.slice(0, 120))
      : [];

    let lines: VehicleLineInput[] = [];
    if (Array.isArray(body.vehicles) && body.vehicles.length > 0) {
      lines = body.vehicles.slice(0, 3).map((v) => ({
        serviceSlug: String(v.serviceSlug ?? '').trim(),
        vehicleClass: String(v.vehicleClass ?? '').trim(),
        vehicleDescription: String(v.vehicleDescription ?? '').trim(),
      }));
    } else if (body.serviceSlug && body.vehicleClass && body.vehicleDescription) {
      lines = [
        {
          serviceSlug: body.serviceSlug.trim(),
          vehicleClass: body.vehicleClass.trim(),
          vehicleDescription: body.vehicleDescription.trim(),
        },
      ];
    }

    const phoneNorm = normalizeUsPhone10Digits(guestPhone);
    if (!phoneNorm.ok) {
      return NextResponse.json({ error: phoneNorm.error }, { status: 400 });
    }
    const phoneDigits = phoneNorm.digits10;

    if (
      lines.length === 0 ||
      !scheduledStart ||
      !guestName ||
      !guestEmail ||
      !serviceAddress ||
      !serviceCity ||
      serviceState.length < 2 ||
      serviceZip.length !== 5 ||
      lines.some(
        (l) =>
          !l.serviceSlug ||
          !l.vehicleClass ||
          !l.vehicleDescription ||
          !ALLOWED_CLASS.has(normalizeVehicleClass(l.vehicleClass)),
      )
    ) {
      return NextResponse.json({ error: 'Missing required fields or invalid vehicle class' }, { status: 400 });
    }

    const admin = tryCreateAdminSupabase();
    if (!admin) {
      return NextResponse.json(
        {
          error: 'Database not configured',
          code: 'MISSING_SUPABASE_SERVICE_ROLE',
          hint: 'Add SUPABASE_SERVICE_ROLE_KEY and public Supabase URL/keys to .env.local',
        },
        { status: 503 },
      );
    }

    const { data: siteSettings } = await admin
      .from('site_settings')
      .select('accept_public_bookings, allow_free_test_promo')
      .limit(1)
      .maybeSingle();
    if ((siteSettings as { accept_public_bookings?: boolean } | null)?.accept_public_bookings === false) {
      return NextResponse.json(
        { error: 'Online booking is temporarily paused. Please call Gloss Boss ATX to schedule.' },
        { status: 503 },
      );
    }

    const quote = await computeQuoteFromInputs(admin, { lines, addOns, offerRef: body.offerId });
    if (!quote.ok) {
      return NextResponse.json({ error: quote.error }, { status: quote.status });
    }
    const priced = quote.breakdown;
    const resolved = quote.resolved;
    const claimed = quote.claimed;
    const allowFreeTestPromo = (siteSettings as { allow_free_test_promo?: boolean } | null)?.allow_free_test_promo === true;
    const freePromoApplied =
      promoCode === 'FREE' &&
      allowFreeTestPromo &&
      resolved.length > 0 &&
      resolved.every((r) => r.serviceSlug === 'exterior-wash');

    const totalBaseCents = freePromoApplied ? 0 : priced.finalTotalCents;
    const depositAmountCents = freePromoApplied ? 0 : priced.depositCents;
    const primary = resolved[0]!;
    const offerRowId = claimed?.offerId ?? null;

    const scheduled = new Date(scheduledStart);
    if (Number.isNaN(scheduled.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }

    const availRules = await loadBookingAvailabilityRules(admin);
    if (!isBookingSlotAllowed(scheduled, availRules)) {
      return NextResponse.json(
        {
          error:
            'Selected time is outside online booking hours. We accept appointments Friday after 5pm, all day Saturday, and all day Sunday.',
        },
        { status: 400 },
      );
    }

    const emailNorm = guestEmail.trim().toLowerCase();
    let customerId: string | null = null;
    try {
      const { data: existingCustomer, error: lookupErr } = await admin
        .from('customers')
        .select('id')
        .eq('email', emailNorm)
        .maybeSingle();
      if (lookupErr) {
        console.error('[api/bookings] customer lookup failed — continuing without CRM link', lookupErr.message);
      } else if (existingCustomer?.id) {
        customerId = existingCustomer.id;
        const { error: upErr } = await admin
          .from('customers')
          .update({
            phone: phoneDigits,
            full_name: guestName,
            address_line1: serviceAddress,
            city: serviceCity,
            state: serviceState,
            postal_code: serviceZip,
          })
          .eq('id', customerId);
        if (upErr) {
          console.error('[api/bookings] customer update failed — appointment still links to customer', upErr.message);
        }
      } else {
        const { data: newCustomer, error: custErr } = await admin
          .from('customers')
          .insert({
            email: emailNorm,
            phone: phoneDigits,
            full_name: guestName,
            address_line1: serviceAddress,
            city: serviceCity,
            state: serviceState,
            postal_code: serviceZip,
          })
          .select('id')
          .single();
        if (custErr || !newCustomer?.id) {
          console.error(
            '[api/bookings] customer insert failed — continuing as guest-only booking',
            custErr?.message,
          );
          customerId = null;
        } else {
          customerId = newCustomer.id;
        }
      }
    } catch (e) {
      console.error('[api/bookings] customer upsert unexpected — continuing as guest-only booking', e);
      customerId = null;
    }

    const vehicleDescriptionJoined = resolved.map((r) => r.vehicleDescription).join(' · ');
    const bookingVehicles = resolved.map((r) => ({
      service_slug: r.serviceSlug,
      vehicle_class: r.vehicleClass,
      vehicle_description: r.vehicleDescription,
      price_cents: r.priceCents,
    }));

    const insertPayload: Record<string, unknown> = {
      guest_email: emailNorm,
      guest_phone: phoneDigits,
      guest_name: guestName,
      vehicle_description: vehicleDescriptionJoined,
      service_slug: primary.serviceSlug,
      vehicle_class: primary.vehicleClass,
      base_price_cents: totalBaseCents,
      deposit_percent: priced.depositPercent,
      deposit_amount_cents: depositAmountCents,
      scheduled_start: scheduled.toISOString(),
      notes: notes ?? null,
      service_address: serviceAddress,
      service_city: serviceCity,
      service_state: serviceState,
      service_zip: serviceZip,
      service_address_notes: serviceAddressNotes || null,
      status: freePromoApplied ? 'test_comped' : 'awaiting_payment',
      payment_status: freePromoApplied ? 'manual_comped' : 'awaiting_deposit',
      promo_code: promoCode || null,
      comp_reason: freePromoApplied ? 'FREE test promo applied to Exterior Wash booking' : null,
      booking_vehicles: bookingVehicles,
      booking_add_ons: addOns,
      booking_source: 'online',
    };
    if (customerId) insertPayload.customer_id = customerId;
    if (offerRowId) insertPayload.offer_id = offerRowId;

    const { data: appointment, error: apptErr } = await insertAppointmentResilient(admin, insertPayload);

    if (apptErr || !appointment) {
      const detail = apptErr ?? 'unknown';
      await logBookingError(admin, {
        stage: 'insertAppointmentResilient',
        error_message: String(detail),
        payload: insertPayload,
      });
      await recordBookingFailure(admin, { stage: 'insertAppointmentResilient', message: String(detail) });

      const fb = await saveBookingFallback(admin, {
        payload: insertPayload,
        guestEmail: emailNorm,
        guestPhone: phoneDigits,
        guestName: guestName.trim(),
        depositAmountCents: depositAmountCents,
        basePriceCents: totalBaseCents,
        scheduledStartIso: scheduled.toISOString(),
      });

      if (fb) {
        await recordBookingSuccess(admin);
        return NextResponse.json({
          usedFallback: true,
          fallbackBookingId: fb.id,
          accessToken: fb.access_token,
          depositAmountCents: depositAmountCents,
        });
      }

      console.error('[api/bookings] appointment insert failed — no fallback row', {
        detail,
        hadCustomerLink: Boolean(customerId),
        hadOffer: Boolean(offerRowId),
      });
      const friendly =
        typeof detail === 'string' &&
        (detail.includes('database configuration issue') || detail.includes('Please call Gloss Boss'))
          ? detail
          : 'We could not save your booking right now. Please try again or call Gloss Boss ATX at (512) 481-2319.';
      return NextResponse.json({ error: friendly, code: 'BOOKING_INSERT_FAILED' }, { status: 500 });
    }

    await recordBookingSuccess(admin);

    if (freePromoApplied) {
      await admin
        .from('payments')
        .insert({
          appointment_id: appointment.id,
          customer_id: customerId,
          amount_cents: 0,
          status: 'manual_comped',
          payment_kind: 'test_comp',
          metadata: {
            promo_code: 'FREE',
            service_address: [serviceAddress, serviceCity, serviceState, serviceZip].filter(Boolean).join(', '),
            vehicles: bookingVehicles,
          },
        })
        .then(({ error }) => {
          if (error) console.warn('[api/bookings] FREE promo payment marker skipped', error.message);
        });

      return NextResponse.json({
        appointmentId: appointment.id,
        accessToken: appointment.access_token,
        depositAmountCents: 0,
        skipPayment: true,
        compStatus: 'test_comped',
      });
    }

    void notifyBookingConfirmationQueued({
      toEmail: emailNorm,
      guestName: guestName.trim(),
      whenIso: scheduled.toISOString(),
      totalCents: priced.finalTotalCents,
      depositCents: depositAmountCents,
      vehicles: vehicleDescriptionJoined,
    }).catch(() => {});

    void notifyBusinessNewBookingQueued({
      guestName: guestName.trim(),
      guestEmail: emailNorm,
      guestPhone: phoneDigits,
      whenIso: scheduled.toISOString(),
      totalCents: priced.finalTotalCents,
      depositCents: depositAmountCents,
      appointmentId: appointment.id,
      vehicles: vehicleDescriptionJoined,
    }).catch(() => {});

    return NextResponse.json({
      appointmentId: appointment.id,
      accessToken: appointment.access_token,
      depositAmountCents: depositAmountCents,
    });
  } catch (e) {
    console.error('[api/bookings] unexpected', e);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

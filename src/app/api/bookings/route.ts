import { NextResponse } from 'next/server';
import {
  logBookingError,
  recordBookingFailure,
  recordBookingSuccess,
  saveBookingFallback,
} from '@/lib/booking-diagnostics';
import { isBookingSlotAllowed } from '@/lib/booking-availability';
import { buildAppointmentScheduleFields } from '@/lib/booking-slot-blocking';
import { fetchBookedBlocks, slotConflictsWithBlocks } from '@/lib/booking-slot-blocking';
import { totalBookingDurationMinutes } from '@/lib/booking-service-duration';
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
import { syncVehiclesForAppointment, syncVehiclesToCustomer } from '@/lib/crm-vehicle-sync';

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
  serviceLocationType?: string;
  waterAccess?: string;
  powerAccess?: string;
  parkingAccess?: string;
  gateAccessNotes?: string;
  promoCode?: string;
  paymentChoice?: 'deposit' | 'full';
  notes?: string;
};

const ALLOWED_CLASS = new Set(['sedan', 'suv', 'truck', 'suv_truck']);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const { scheduledStart, guestName, guestEmail, guestPhone, notes } = body;
    const serviceAddress = String(body.serviceAddress ?? '').trim();
    const serviceCity = String(body.serviceCity ?? '').trim();
    const serviceState = String(body.serviceState ?? 'TX').trim().toUpperCase();
    const serviceZip = String(body.serviceZip ?? '').replace(/\D/g, '').slice(0, 5);
    const serviceAddressNotes = String(body.serviceAddressNotes ?? '').trim();
    const gateAccessNotes = String(body.gateAccessNotes ?? body.serviceAddressNotes ?? '').trim();
    const serviceLocationType = String(body.serviceLocationType ?? '').trim();
    const waterAccess = String(body.waterAccess ?? '').trim();
    const powerAccess = String(body.powerAccess ?? '').trim();
    const parkingAccess = String(body.parkingAccess ?? '').trim();
    const ACCESS_VALUES = new Set(['yes', 'no', 'unsure']);
    const LOCATION_TYPES = new Set(['house', 'apartment', 'business', 'other']);
    const promoCode = String(body.promoCode ?? '').trim().toUpperCase();
    const paymentChoice = body.paymentChoice === 'full' ? 'full' : 'deposit';
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
        vehicleColor: String((v as VehicleLineInput & { vehicleColor?: string }).vehicleColor ?? '').trim(),
      }));
    } else if (body.serviceSlug && body.vehicleClass && body.vehicleDescription) {
      lines = [
        {
          serviceSlug: body.serviceSlug.trim(),
          vehicleClass: body.vehicleClass.trim(),
          vehicleDescription: body.vehicleDescription.trim(),
          vehicleColor: String((body as { vehicleColor?: string }).vehicleColor ?? '').trim(),
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
          !String((l as { vehicleColor?: string }).vehicleColor ?? '').trim() ||
          !ALLOWED_CLASS.has(normalizeVehicleClass(l.vehicleClass)),
      )
    ) {
      return NextResponse.json({ error: 'Missing required fields or invalid vehicle class' }, { status: 400 });
    }

    if (
      !serviceLocationType ||
      !LOCATION_TYPES.has(serviceLocationType) ||
      !waterAccess ||
      !ACCESS_VALUES.has(waterAccess) ||
      !powerAccess ||
      !ACCESS_VALUES.has(powerAccess) ||
      !parkingAccess ||
      !ACCESS_VALUES.has(parkingAccess)
    ) {
      return NextResponse.json(
        { error: 'Service location type and water, power, and parking access answers are required.' },
        { status: 400 },
      );
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

    let siteSettingsQuery: { data: unknown[] | null; error: { message: string } | null } = await admin
      .from('site_settings')
      .select('key, value, accept_public_bookings, allow_free_test_promo')
      .limit(50);
    if (siteSettingsQuery.error && /accept_public_bookings|allow_free_test_promo|column|schema cache|Could not find|does not exist/i.test(siteSettingsQuery.error.message)) {
      siteSettingsQuery = await admin.from('site_settings').select('key, value').limit(50);
    }
    const siteSettingsRows = siteSettingsQuery.data;
    const siteSettings = (siteSettingsRows ?? []) as Array<Record<string, unknown>>;
    const publicBookingsOff = siteSettings.some((r) => r.accept_public_bookings === false);
    const allowFreeTestPromo = siteSettings.some(
      (r) => r.allow_free_test_promo === true || (String(r.key ?? '') === 'allow_free_test_promo' && String(r.value ?? '').toLowerCase() === 'true'),
    );
    if (publicBookingsOff) {
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
    if (promoCode === 'FREE' && !allowFreeTestPromo) {
      return NextResponse.json({ error: 'Promo code not available.' }, { status: 400 });
    }
    const freePromoApplied =
      promoCode === 'FREE' &&
      allowFreeTestPromo &&
      resolved.length === 1 &&
      resolved[0]?.serviceSlug === 'exterior-wash' &&
      normalizeVehicleClass(resolved[0]?.vehicleClass ?? '') === 'sedan';
    if (promoCode === 'FREE' && allowFreeTestPromo && !freePromoApplied) {
      const reason = resolved.length !== 1
        ? 'FREE only applies to one vehicle at a time.'
        : resolved[0]?.serviceSlug !== 'exterior-wash'
          ? 'FREE only applies to Exterior Wash.'
          : normalizeVehicleClass(resolved[0]?.vehicleClass ?? '') !== 'sedan'
            ? 'FREE only applies to Sedan vehicle class.'
            : 'FREE only applies to a Sedan Exterior Wash test booking.';
      return NextResponse.json({ error: reason }, { status: 400 });
    }

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

    const durationLines = resolved.map((r) => ({ serviceSlug: r.serviceSlug, vehicleClass: r.vehicleClass }));
    const durationMinutes = totalBookingDurationMinutes(durationLines);
    const rangeStart = new Date(scheduled.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const rangeEnd = new Date(scheduled.getTime() + 48 * 60 * 60 * 1000).toISOString();
    const bookedBlocks = await fetchBookedBlocks(admin, rangeStart, rangeEnd);
    if (slotConflictsWithBlocks(scheduled.toISOString(), durationMinutes, bookedBlocks)) {
      return NextResponse.json(
        { error: 'That time slot is no longer available. Please choose another time.' },
        { status: 409 },
      );
    }

    const scheduleFields = buildAppointmentScheduleFields(scheduled.toISOString(), durationLines);

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
            service_address: serviceAddress,
            service_city: serviceCity,
            service_state: serviceState,
            service_zip: serviceZip,
            service_location_type: serviceLocationType,
            water_access: waterAccess,
            power_access: powerAccess,
            parking_access: parkingAccess,
            gate_access_notes: gateAccessNotes || null,
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
            service_address: serviceAddress,
            service_city: serviceCity,
            service_state: serviceState,
            service_zip: serviceZip,
            service_location_type: serviceLocationType,
            water_access: waterAccess,
            power_access: powerAccess,
            parking_access: parkingAccess,
            gate_access_notes: gateAccessNotes || null,
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
      vehicle_color: r.vehicleColor || null,
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
      estimated_duration_minutes: scheduleFields.estimated_duration_minutes,
      estimated_end: scheduleFields.estimated_end,
      notes: notes ?? null,
      service_address: serviceAddress,
      service_city: serviceCity,
      service_state: serviceState,
      service_zip: serviceZip,
      service_address_notes: serviceAddressNotes || gateAccessNotes || null,
      gate_access_notes: gateAccessNotes || serviceAddressNotes || null,
      service_location_type: serviceLocationType,
      water_access: waterAccess,
      power_access: powerAccess,
      parking_access: parkingAccess,
      status: freePromoApplied ? 'test_comped' : 'awaiting_payment',
      payment_status: freePromoApplied ? 'comped' : 'awaiting_deposit',
      payment_choice: paymentChoice,
      balance_due_cents: paymentChoice === 'full' || freePromoApplied ? 0 : Math.max(0, totalBaseCents - depositAmountCents),
      promo_code: promoCode || null,
      comp_reason: freePromoApplied ? 'FREE test promo applied to Exterior Wash booking' : null,
      booking_vehicles: bookingVehicles,
      booking_pricing_breakdown: priced,
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

    if (customerId) {
      void syncVehiclesToCustomer(admin, {
        customerId,
        bookingVehicles,
        vehicleDescription: vehicleDescriptionJoined,
        serviceSlug: primary.serviceSlug,
        vehicleClass: primary.vehicleClass,
      });
    } else {
      void syncVehiclesForAppointment(admin, String(appointment.id));
    }

    if (freePromoApplied) {
      const compPayment = await admin
        .from('payments')
        .insert({
          appointment_id: appointment.id,
          customer_id: customerId,
          amount_cents: 0,
          status: 'comped',
          payment_method: 'test_comped',
          payment_choice: 'comped',
          payment_kind: 'test_comp',
          paid_at: new Date().toISOString(),
          metadata: {
            promo_code: 'FREE',
            source: 'free_test_promo',
            service_address: [serviceAddress, serviceCity, serviceState, serviceZip].filter(Boolean).join(', '),
            vehicles: bookingVehicles,
          },
        })
        .select('id')
        .maybeSingle()
        .then((res) => {
          const { error } = res;
          if (error) console.warn('[api/bookings] FREE promo payment marker skipped', error.message);
          return res.data as { id?: string } | null;
        });
      await admin.from('receipts').insert({
        appointment_id: appointment.id,
        customer_id: customerId,
        payment_id: compPayment?.id ?? null,
        receipt_number: `COMP-${String(appointment.id).slice(0, 8)}`,
        amount_cents: 0,
        payment_method: 'test_comped',
        status: 'issued',
        metadata: { promo_code: 'FREE', source: 'free_test_promo', vehicles: bookingVehicles },
      });

      void notifyBookingConfirmationQueued({
        toEmail: emailNorm,
        toPhone: phoneDigits,
        guestName: guestName.trim(),
        whenIso: scheduled.toISOString(),
        totalCents: priced.finalTotalCents,
        depositCents: 0,
        vehicles: vehicleDescriptionJoined,
        appointmentId: appointment.id,
      }).catch(() => {});

      return NextResponse.json({
        appointmentId: appointment.id,
        accessToken: appointment.access_token,
        depositAmountCents: 0,
        skipPayment: true,
        compStatus: 'test_comped',
        message: 'FREE test comp applied',
      });
    }

    /* Booking confirmation + deposit receipt emails send after Stripe checkout via notifyBookingCheckoutPaid. */

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

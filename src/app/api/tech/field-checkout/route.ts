import { NextResponse } from 'next/server';
import { getAppOrigin } from '@/lib/env/app-origin';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { tryCreateServerSupabase } from '@/lib/supabase/server';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import {
  breakdownForFieldFullPay,
  computeQuoteFromInputs,
  insertAppointmentResilient,
  type VehicleLineInput,
} from '@/lib/booking-server-shared';
import { createFieldInvoiceCheckoutSession } from '@/lib/stripe/checkout';
import { normalizeUsPhone10Digits } from '@/lib/us-phone';

export const runtime = 'nodejs';

function isFieldTechRole(role: string | null): boolean {
  return role === 'technician' || role === 'admin' || role === 'super_admin';
}

/**
 * Field invoice: same pricing engine as online booking; creates an appointment row and Stripe Checkout for the FULL total.
 */
export async function POST(request: Request) {
  try {
    const supabase = await tryCreateServerSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Server session unavailable' }, { status: 503 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile, error: pErr } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    let role = parseAppRole(profile?.role);
    if (pErr || !profile?.role) {
      const em = (user.email ?? '').trim().toLowerCase();
      if (em === OWNER_LOGIN_EMAIL) role = 'super_admin';
    }
    if (!isFieldTechRole(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as {
      vehicles?: VehicleLineInput[];
      addOns?: string[];
      offerId?: string;
      guestName?: string;
      guestEmail?: string;
      guestPhone?: string;
      notes?: string;
    };

    const guestName = String(body.guestName ?? '').trim();
    const guestEmail = String(body.guestEmail ?? '').trim().toLowerCase();
    const phoneNorm = normalizeUsPhone10Digits(String(body.guestPhone ?? ''));
    if (!phoneNorm.ok) {
      return NextResponse.json({ error: phoneNorm.error }, { status: 400 });
    }
    if (!guestName || !guestEmail) {
      return NextResponse.json({ error: 'Customer name and email are required for field invoicing.' }, { status: 400 });
    }

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
    }

    if (lines.length === 0) {
      return NextResponse.json({ error: 'Add at least one vehicle line with package and description.' }, { status: 400 });
    }

    const admin = tryCreateAdminSupabase();
    if (!admin) {
      return NextResponse.json(
        { error: 'Database not configured', code: 'MISSING_SUPABASE_SERVICE_ROLE' },
        { status: 503 },
      );
    }

    const quote = await computeQuoteFromInputs(admin, {
      lines,
      addOns,
      offerRef: body.offerId,
    });
    if (!quote.ok) {
      return NextResponse.json({ error: quote.error }, { status: quote.status });
    }

    const fieldBd = breakdownForFieldFullPay(quote.breakdown);
    const totalBaseCents = fieldBd.finalTotalCents;
    const fullPayCents = fieldBd.depositCents;
    const primary = quote.resolved[0]!;
    const offerRowId = quote.claimed?.offerId ?? null;
    const vehicleDescriptionJoined = quote.resolved.map((r) => r.vehicleDescription).join(' · ');
    const bookingVehicles = quote.resolved.map((r) => ({
      service_slug: r.serviceSlug,
      vehicle_class: r.vehicleClass,
      vehicle_description: r.vehicleDescription,
      price_cents: r.priceCents,
    }));

    const notesRaw = String(body.notes ?? '').trim().slice(0, 2000);
    const notes = [notesRaw ? notesRaw : null, 'Field invoice (technician)'].filter(Boolean).join(' — ');

    let customerId: string | null = null;
    const { data: existingCustomer } = await admin.from('customers').select('id').eq('email', guestEmail).maybeSingle();
    if (existingCustomer) {
      customerId = existingCustomer.id;
      await admin.from('customers').update({ phone: phoneNorm.digits10, full_name: guestName }).eq('id', customerId);
    } else {
      const { data: newCustomer, error: custErr } = await admin
        .from('customers')
        .insert({ email: guestEmail, phone: phoneNorm.digits10, full_name: guestName })
        .select('id')
        .single();
      if (custErr || !newCustomer) {
        return NextResponse.json({ error: 'Could not create customer record' }, { status: 500 });
      }
      customerId = newCustomer.id;
    }

    const scheduledStart = new Date();
    scheduledStart.setMinutes(scheduledStart.getMinutes() + 30);

    const insertPayload: Record<string, unknown> = {
      guest_email: guestEmail,
      guest_phone: phoneNorm.digits10,
      guest_name: guestName,
      customer_id: customerId,
      vehicle_description: vehicleDescriptionJoined,
      service_slug: primary.serviceSlug,
      vehicle_class: primary.vehicleClass,
      base_price_cents: totalBaseCents,
      deposit_percent: 100,
      deposit_amount_cents: fullPayCents,
      scheduled_start: scheduledStart.toISOString(),
      notes,
      status: 'awaiting_payment',
      booking_vehicles: bookingVehicles,
      booking_add_ons: addOns,
      assigned_technician_id: user.id,
      booking_source: 'field_invoice',
    };
    if (offerRowId) insertPayload.offer_id = offerRowId;

    const { data: appointment, error: apptErr } = await insertAppointmentResilient(admin, insertPayload);
    if (apptErr || !appointment) {
      console.error('[field-checkout] insert failed', apptErr);
      return NextResponse.json({ error: apptErr || 'Could not create invoice record' }, { status: 500 });
    }

    const origin = getAppOrigin(request);
    const checkout = await createFieldInvoiceCheckoutSession({
      admin,
      appointmentId: appointment.id,
      accessToken: appointment.access_token,
      origin,
      technicianId: user.id,
    });

    if (!checkout.ok) {
      if (checkout.code === 'STRIPE_NOT_CONFIGURED') {
        return NextResponse.json(
          {
            error: checkout.error,
            code: checkout.code,
            appointmentId: appointment.id,
            accessToken: appointment.access_token,
            breakdown: fieldBd,
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: checkout.error, code: checkout.code, appointmentId: appointment.id },
        { status: checkout.code === 'STRIPE_ERROR' ? 503 : 400 },
      );
    }

    if ('skipPayment' in checkout && checkout.skipPayment) {
      return NextResponse.json({
        skipPayment: true,
        code: checkout.code,
        message: checkout.message,
        appointmentId: appointment.id,
        accessToken: appointment.access_token,
        breakdown: fieldBd,
      });
    }

    if (!('url' in checkout)) {
      return NextResponse.json({ error: 'Checkout did not return a card URL', code: 'CHECKOUT_NO_URL', appointmentId: appointment.id }, { status: 400 });
    }

    return NextResponse.json({
      url: checkout.url,
      appointmentId: appointment.id,
      accessToken: appointment.access_token,
      breakdown: fieldBd,
    });
  } catch (e) {
    const raw =
      e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : '';
    console.warn('[tech/field-checkout]', e);
    return NextResponse.json(
      { error: raw && raw !== 'undefined' ? raw.slice(0, 240) : 'Checkout failed — try again or contact support.' },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isBookingSlotAllowed, parseBookingAvailabilityRules } from '@/lib/booking-availability';
import { safePriceCentsForBooking, type PriceRowInput } from '@/lib/safe-price-resolver';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function loadBookingAvailabilityRules(admin: SupabaseClient) {
  try {
    const { data } = await admin.from('site_settings').select('value').eq('key', 'booking_availability').maybeSingle();
    if (!data?.value) return parseBookingAvailabilityRules(null);
    try {
      return parseBookingAvailabilityRules(JSON.parse(String(data.value)));
    } catch {
      return parseBookingAvailabilityRules(null);
    }
  } catch {
    return parseBookingAvailabilityRules(null);
  }
}

async function loadServicePricesForService(admin: SupabaseClient, serviceId: string): Promise<PriceRowInput[]> {
  const { data } = await admin.from('service_prices').select('*').eq('service_id', serviceId);
  const rows: PriceRowInput[] = [];
  for (const row of data ?? []) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const sid = typeof r.service_id === 'string' ? r.service_id : serviceId;
    const vc = typeof r.vehicle_class === 'string' ? r.vehicle_class : '';
    const pc = r.price_cents;
    if (typeof pc === 'number' && !Number.isNaN(pc)) rows.push({ service_id: sid, vehicle_class: vc, price_cents: pc });
  }
  return rows;
}

type VehicleLine = { serviceSlug: string; vehicleClass: string; vehicleDescription: string };

type Body = {
  serviceSlug?: string;
  vehicleClass?: string;
  vehicles?: VehicleLine[];
  addOns?: string[];
  scheduledStart: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  vehicleDescription?: string;
  notes?: string;
};

const ALLOWED_CLASS = new Set(['sedan', 'suv', 'truck', 'suv_truck']);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const { scheduledStart, guestName, guestEmail, guestPhone, notes } = body;
    const addOns = Array.isArray(body.addOns)
      ? body.addOns
          .map((a) => String(a ?? '').trim())
          .filter(Boolean)
          .slice(0, 12)
          .map((s) => s.slice(0, 120))
      : [];

    let lines: VehicleLine[] = [];
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

    if (
      lines.length === 0 ||
      !scheduledStart ||
      !guestName ||
      !guestEmail ||
      !guestPhone ||
      lines.some((l) => !l.serviceSlug || !l.vehicleClass || !l.vehicleDescription || !ALLOWED_CLASS.has(l.vehicleClass))
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

    let totalBaseCents = 0;
    const resolved: { serviceSlug: string; vehicleClass: string; vehicleDescription: string; priceCents: number }[] = [];

    for (const line of lines) {
      const { data: service, error: svcErr } = await admin
        .from('services')
        .select('id, slug')
        .eq('slug', line.serviceSlug)
        .eq('active', true)
        .maybeSingle();

      if (svcErr || !service) {
        return NextResponse.json({ error: `Invalid service: ${line.serviceSlug}` }, { status: 400 });
      }

      const priceRows = await loadServicePricesForService(admin, service.id);
      const priceCents = safePriceCentsForBooking(
        { slug: line.serviceSlug, serviceId: service.id },
        line.vehicleClass,
        priceRows,
      );
      if (priceCents == null) {
        return NextResponse.json(
          {
            error:
              line.serviceSlug === 'ceramic-coating'
                ? 'Ceramic coating requires a consultation — call us to book.'
                : `Pricing not available for ${line.serviceSlug} / ${line.vehicleClass}.`,
          },
          { status: 400 },
        );
      }

      totalBaseCents += priceCents;
      resolved.push({
        serviceSlug: line.serviceSlug,
        vehicleClass: line.vehicleClass,
        vehicleDescription: line.vehicleDescription,
        priceCents,
      });
    }

    const primary = resolved[0]!;
    const depositPercent = 30;
    const depositAmountCents = Math.round((totalBaseCents * depositPercent) / 100);

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
    const { data: existingCustomer } = await admin.from('customers').select('id').eq('email', emailNorm).maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;
      await admin.from('customers').update({ phone: guestPhone, full_name: guestName }).eq('id', customerId);
    } else {
      const { data: newCustomer, error: custErr } = await admin
        .from('customers')
        .insert({ email: emailNorm, phone: guestPhone, full_name: guestName })
        .select('id')
        .single();
      if (custErr || !newCustomer) {
        return NextResponse.json({ error: 'Could not create customer record' }, { status: 500 });
      }
      customerId = newCustomer.id;
    }

    const vehicleDescriptionJoined = resolved.map((r) => r.vehicleDescription).join(' · ');
    const bookingVehicles = resolved.map((r) => ({
      service_slug: r.serviceSlug,
      vehicle_class: r.vehicleClass,
      vehicle_description: r.vehicleDescription,
      price_cents: r.priceCents,
    }));

    const { data: appointment, error: apptErr } = await admin
      .from('appointments')
      .insert({
        guest_email: emailNorm,
        guest_phone: guestPhone,
        guest_name: guestName,
        customer_id: customerId,
        vehicle_description: vehicleDescriptionJoined,
        service_slug: primary.serviceSlug,
        vehicle_class: primary.vehicleClass,
        base_price_cents: totalBaseCents,
        deposit_percent: depositPercent,
        deposit_amount_cents: depositAmountCents,
        scheduled_start: scheduled.toISOString(),
        notes: notes ?? null,
        status: 'awaiting_payment',
        booking_vehicles: bookingVehicles,
        booking_add_ons: addOns,
      })
      .select('id, access_token')
      .single();

    if (apptErr || !appointment) {
      return NextResponse.json({ error: 'Could not create booking' }, { status: 500 });
    }

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

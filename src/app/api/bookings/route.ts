import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeBookingPricing, type BookingPricingBreakdown } from '@/lib/booking-pricing';
import { isBookingSlotAllowed } from '@/lib/booking-availability';
import { parseBookingAvailabilityConfig } from '@/lib/booking-availability-config';
import { parseDealConfig } from '@/lib/public-site-data';
import { safePriceCentsForBooking, type PriceRowInput } from '@/lib/safe-price-resolver';
import { normalizeVehicleClass } from '@/lib/vehicle-pricing';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function loadBookingAvailabilityRules(admin: SupabaseClient) {
  try {
    const { data } = await admin.from('site_settings').select('value').eq('key', 'booking_availability').maybeSingle();
    if (!data?.value) return parseBookingAvailabilityConfig(null);
    try {
      return parseBookingAvailabilityConfig(JSON.parse(String(data.value)));
    } catch {
      return parseBookingAvailabilityConfig(null);
    }
  } catch {
    return parseBookingAvailabilityConfig(null);
  }
}

async function loadDealConfigForBooking(admin: SupabaseClient) {
  const { data } = await admin.from('homepage_content').select('value').eq('key', 'deal_config').maybeSingle();
  return parseDealConfig(data?.value ?? null);
}

async function loadClaimedOffer(admin: SupabaseClient, offerId: string | undefined) {
  const id = String(offerId ?? '').trim();
  if (!id) return null;
  const { data } = await admin
    .from('offers')
    .select('percent_off, discount_percent, active, stackable')
    .eq('id', id)
    .maybeSingle();
  if (!data || !data.active) return null;
  const pct = Number(
    (data as { percent_off?: number; discount_percent?: number }).percent_off ??
      (data as { discount_percent?: number }).discount_percent ??
      0,
  );
  if (!Number.isFinite(pct) || pct <= 0) return null;
  const stack = (data as { stackable?: boolean }).stackable;
  return { percent: pct, stackableWithSitePromo: stack !== false };
}

async function sumSelectedAddonCents(admin: SupabaseClient, selections: string[]): Promise<number> {
  if (selections.length === 0) return 0;
  const { data } = await admin.from('addons').select('slug, label, price_cents').eq('active', true);
  const rows = (data ?? []) as { slug?: string | null; label?: string | null; price_cents?: number | null }[];
  let sum = 0;
  for (const sel of selections) {
    const key = sel.trim().toLowerCase();
    const hit = rows.find(
      (r) =>
        (typeof r.slug === 'string' && r.slug.toLowerCase() === key) ||
        (typeof r.label === 'string' && r.label.toLowerCase() === key),
    );
    if (hit && typeof hit.price_cents === 'number' && hit.price_cents > 0) sum += hit.price_cents;
  }
  return sum;
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
  offerId?: string;
  scheduledStart: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  vehicleDescription?: string;
  notes?: string;
};

const ALLOWED_CLASS = new Set(['sedan', 'suv_truck']);

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

    const vehicleLineCents: number[] = [];
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
      const vehicleClass = normalizeVehicleClass(line.vehicleClass);
      const priceCents = safePriceCentsForBooking(
        { slug: line.serviceSlug, serviceId: service.id },
        vehicleClass,
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

      vehicleLineCents.push(priceCents);
      resolved.push({
        serviceSlug: line.serviceSlug,
        vehicleClass,
        vehicleDescription: line.vehicleDescription,
        priceCents,
      });
    }

    const addOnCentsSum = await sumSelectedAddonCents(admin, addOns);
    const deals = await loadDealConfigForBooking(admin);
    const claimed = await loadClaimedOffer(admin, body.offerId);
    const depositPercent = 30;
    const breakdown = computeBookingPricing({
      vehicleLineCents,
      addOnCentsSum,
      deals,
      claimedOffer: claimed,
      depositPercent,
    });
    if ('kind' in breakdown) {
      return NextResponse.json({ error: 'Invalid pricing' }, { status: 400 });
    }
    const priced = breakdown as BookingPricingBreakdown;

    const totalBaseCents = priced.finalTotalCents;
    const depositAmountCents = priced.depositCents;
    const primary = resolved[0]!;
    const offerIdForRow = claimed && body.offerId ? String(body.offerId).trim() : null;

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

    const insertPayload: Record<string, unknown> = {
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
    };
    if (offerIdForRow) insertPayload.offer_id = offerIdForRow;

    let ins = await admin.from('appointments').insert(insertPayload).select('id, access_token').single();
    if (ins.error && /offer_id|column/i.test(ins.error.message)) {
      const rest = { ...insertPayload };
      delete rest.offer_id;
      ins = await admin.from('appointments').insert(rest).select('id, access_token').single();
    }
    const appointment = ins.data;
    const apptErr = ins.error;


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

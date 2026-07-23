import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  logBookingError,
  recordBookingFailure,
  recordBookingSuccess,
  saveBookingFallback,
} from '@/lib/booking-diagnostics';
import { isBookingSlotAllowed } from '@/lib/booking-availability';
import { buildAppointmentScheduleFields } from '@/lib/booking-slot-blocking';
import { loadDurationCatalog } from '@/lib/booking-duration-catalog';
import { queueGoogleCalendarSync } from '@/lib/google/google-calendar-sync';
import { maybeAutoPullGoogleCalendar } from '@/lib/google/google-calendar-auto-pull';
import { fetchBookedBlocks, slotConflictsWithBlocks } from '@/lib/booking-slot-blocking';
import { totalBookingDurationMinutes } from '@/lib/booking-service-duration';
import {
  computeQuoteFromInputs,
  insertAppointmentResilient,
  loadBookingAvailabilityRules,
  type VehicleLineInput,
} from '@/lib/booking-server-shared';
import { incrementPromoUse } from '@/lib/promo-engine';
import { normalizeVehicleClass } from '@/lib/vehicle-pricing';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { normalizeUsPhone10Digits } from '@/lib/us-phone';
import { notifyBookingConfirmationQueued, notifyBusinessNewBookingQueued } from '@/lib/notifications-placeholder';
import { syncVehiclesForAppointment, syncVehiclesToCustomer } from '@/lib/crm-vehicle-sync';
import { buildBookingOrderSnapshot, mergeSnapshotIntoBreakdown } from '@/lib/booking-order-snapshot';
import { logSmsConsentChange, normalizeSmsConsentStatus, SMS_CONSENT_COPY, type SmsConsentSource } from '@/lib/sms-consent';
import { evaluateDiscountPolicy, loadDiscountPolicy } from '@/lib/discount-policy';

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
  referralCode?: string;
  paymentChoice?: 'deposit' | 'full';
  notes?: string;
  smsConsent?: boolean;
  smsConsentSource?: SmsConsentSource;
  requestedCreditCents?: number;
  rewardId?: string;
  campaignId?: string;
  campaignRecipientToken?: string;
};

const ALLOWED_CLASS = new Set(['sedan', 'suv', 'truck', 'suv_truck']);

async function applyCustomerCreditsToAppointment(params: {
  admin: SupabaseClient;
  customerId: string | null;
  appointmentId: string;
  requestedCents: number;
  totalCents: number;
}) {
  const { admin, customerId, appointmentId } = params;
  const requestedCents = Math.max(0, Math.min(params.totalCents, Math.round(params.requestedCents)));
  if (!customerId || requestedCents <= 0) return 0;

  const nowIso = new Date().toISOString();
  const creditsRes = await admin
    .from('customer_credits')
    .select('id, remaining_cents, expires_at, status')
    .eq('customer_id', customerId)
    .in('status', ['active', 'partially_used'])
    .order('expires_at', { ascending: true, nullsFirst: false })
    .order('issued_at', { ascending: true })
    .limit(50);
  if (creditsRes.error || !creditsRes.data?.length) return 0;

  let remainingRequest = requestedCents;
  let appliedTotal = 0;
  const redemptionRows: Array<{ creditId: string; amountCents: number }> = [];
  for (const row of creditsRes.data as Array<{ id: string; remaining_cents: number | null; expires_at: string | null }>) {
    if (remainingRequest <= 0) break;
    if (row.expires_at && row.expires_at < nowIso) continue;
    const available = Math.max(0, typeof row.remaining_cents === 'number' ? row.remaining_cents : 0);
    if (available <= 0) continue;
    const useNow = Math.min(available, remainingRequest);
    const nextRemaining = available - useNow;
    const updateRes = await admin
      .from('customer_credits')
      .update({
        remaining_cents: nextRemaining,
        status: nextRemaining > 0 ? 'partially_used' : 'used',
        redeemed_at: nextRemaining > 0 ? null : nowIso,
        linked_work_order_id: appointmentId,
      })
      .eq('id', row.id)
      .eq('customer_id', customerId);
    if (updateRes.error) {
      console.warn('[api/bookings] credit update skipped', updateRes.error.message);
      continue;
    }
    appliedTotal += useNow;
    remainingRequest -= useNow;
    redemptionRows.push({ creditId: row.id, amountCents: useNow });
    if (nextRemaining === 0) {
      const { redeemReferralRewardForCredit } = await import('@/lib/referral/referral-reward-issuer');
      const rewardRedemption = await redeemReferralRewardForCredit(admin, row.id, appointmentId);
      if (rewardRedemption.error) console.warn('[api/bookings] linked referral reward redemption skipped', rewardRedemption.error);
    }
  }

  if (appliedTotal <= 0) return 0;
  const paymentRes = await admin
    .from('payments')
    .insert({
      appointment_id: appointmentId,
      customer_id: customerId,
      amount_cents: appliedTotal,
      status: 'succeeded',
      payment_method: 'customer_credit',
      payment_choice: 'credit',
      payment_kind: 'credit_redemption',
      paid_at: nowIso,
      metadata: {
        source: 'online_booking_credit',
        requested_credit_cents: requestedCents,
        applied_credit_cents: appliedTotal,
        credits: redemptionRows,
      },
    })
    .select('id')
    .maybeSingle();
  if (paymentRes.error) {
    console.warn('[api/bookings] credit payment marker skipped', paymentRes.error.message);
  }

  if (paymentRes.data?.id) {
    const rows = redemptionRows.map((r) => ({
      credit_id: r.creditId,
      payment_id: paymentRes.data!.id,
      amount_cents: r.amountCents,
      redeemed_at: nowIso,
    }));
    const redemptionRes = await admin.from('customer_credit_redemptions').insert(rows);
    if (redemptionRes.error) {
      console.warn('[api/bookings] credit redemption ledger skipped', redemptionRes.error.message);
    }
  }

  await admin
    .from('appointments')
    .update({
      balance_due_cents: Math.max(0, params.totalCents - appliedTotal),
      payment_status: appliedTotal >= params.totalCents ? 'paid' : 'awaiting_deposit',
      updated_at: nowIso,
    })
    .eq('id', appointmentId);

  return appliedTotal;
}

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
    const referralCode = String(body.referralCode ?? '').trim().toUpperCase();
    const paymentChoice = body.paymentChoice === 'full' ? 'full' : 'deposit';
    const requestedCreditCents = Math.max(0, Math.round(Number(body.requestedCreditCents ?? 0)));
    const smsConsent = body.smsConsent === true;
    const smsConsentSource: SmsConsentSource = body.smsConsentSource === 'online_booking' ? 'online_booking' : 'online_booking';
    const smsConsentTimestamp = new Date().toISOString();
    const smsConsentIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;
    const smsConsentUserAgent = request.headers.get('user-agent');
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
        addOnSlugs: Array.isArray((v as { addOnSlugs?: string[] }).addOnSlugs)
          ? (v as { addOnSlugs?: string[] }).addOnSlugs!.map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, 12)
          : [],
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
    const { isFreePromoEnabled } = await import('@/lib/free-promo');
    const allowFreeTestPromo = await isFreePromoEnabled(admin);
    const discountPolicy = await loadDiscountPolicy(admin);
    if (publicBookingsOff) {
      return NextResponse.json(
        { error: 'Online booking is temporarily paused. Please call Gloss Boss ATX to schedule.' },
        { status: 503 },
      );
    }

    const quote = await computeQuoteFromInputs(admin, {
      lines,
      addOns,
      offerRef: body.offerId,
      promoCode: promoCode || undefined,
      paymentChoice,
      allowFreeTestPromo,
    });
    if (!quote.ok) {
      return NextResponse.json({ error: quote.error }, { status: quote.status });
    }
    const priced = quote.breakdown;
    const resolved = quote.resolved;
    const claimed = quote.claimed;
    const freePromoApplied = quote.promo.freePromoApplied;
    const testOneDollar = quote.promo.testOneDollar;
    if (testOneDollar && paymentChoice !== 'full') {
      return NextResponse.json({ error: 'TEST1 requires pay in full.' }, { status: 400 });
    }

    const totalBaseCents = priced.finalTotalCents;
    let referralDiscountCents = 0;
    let referrerCustomerId: string | null = null;
    if (referralCode) {
      const { applyReferralDiscountToQuote } = await import('@/lib/referral/referral-discount');
      const pricedWithAddOns = priced as unknown as { addOnLines?: Array<{ slug?: string; cents?: number }> };
      const ref = await applyReferralDiscountToQuote(admin, {
        referralCode,
        subtotalCents: totalBaseCents,
        referredEmail: guestEmail,
        serviceLines: resolved.map((line) => ({ serviceSlug: line.serviceSlug, vehicleClass: line.vehicleClass, priceCents: line.priceCents })),
        addOnLines: pricedWithAddOns.addOnLines ?? [],
      });
      if (ref.error) return NextResponse.json({ error: ref.error }, { status: 409 });
      if (!ref.referrerCustomerId && ref.label) {
        return NextResponse.json({ error: ref.label }, { status: 409 });
      }
      referrerCustomerId = ref.referrerCustomerId;
      if (ref.applied) {
        referralDiscountCents = ref.discountCents;
        priced.finalTotalCents = Math.max(0, totalBaseCents - referralDiscountCents);
      }
    }
    let adjustedTotalCents = priced.finalTotalCents;
    let depositAmountCents = paymentChoice === 'full' ? adjustedTotalCents : Math.min(priced.depositCents, adjustedTotalCents);
    let selectedReward: { id: string; discountCents: number; serviceSlug: string | null; addonSlug: string | null; metadata: Record<string, unknown> } | null = null;
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

    const durationLines = resolved.map((r) => ({
      serviceSlug: r.serviceSlug,
      vehicleClass: r.vehicleClass,
      addOnSlugs: r.addOnSlugs ?? [],
    }));
    const durationCatalog = await loadDurationCatalog(admin);
    const durationMinutes = totalBookingDurationMinutes(durationLines, durationCatalog);
    const rangeStart = new Date(scheduled.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const rangeEnd = new Date(scheduled.getTime() + 48 * 60 * 60 * 1000).toISOString();
    await maybeAutoPullGoogleCalendar(admin);
    const bookedBlocks = await fetchBookedBlocks(admin, rangeStart, rangeEnd);
    if (slotConflictsWithBlocks(scheduled.toISOString(), durationMinutes, bookedBlocks)) {
      return NextResponse.json(
        { error: 'That time slot is no longer available. Please choose another time.' },
        { status: 409 },
      );
    }

    const scheduleFields = buildAppointmentScheduleFields(scheduled.toISOString(), durationLines, durationCatalog);

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
            sms_consent: smsConsent,
            sms_consent_source: smsConsentSource,
            sms_consent_timestamp: smsConsentTimestamp,
            sms_consent_ip: smsConsentIp,
            sms_consent_user_agent: smsConsentUserAgent,
            sms_status: normalizeSmsConsentStatus(smsConsent),
            sms_opt_out_timestamp: smsConsent ? null : smsConsentTimestamp,
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
            sms_consent: smsConsent,
            sms_consent_source: smsConsentSource,
            sms_consent_timestamp: smsConsentTimestamp,
            sms_consent_ip: smsConsentIp,
            sms_consent_user_agent: smsConsentUserAgent,
            sms_status: normalizeSmsConsentStatus(smsConsent),
            sms_opt_out_timestamp: smsConsent ? null : smsConsentTimestamp,
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

    const requestedRewardId = String(body.rewardId ?? '').trim();
    let selectedRewardKind: 'referral' | 'loyalty' | 'other' = 'other';
    if (requestedRewardId) {
      if (!customerId) {
        return NextResponse.json({ error: 'Sign in with the customer account that owns this reward before using it.' }, { status: 403 });
      }
      const rewardRes = await admin
        .from('referral_rewards')
        .select('id, customer_id, reward_type, reward_value, status, expires_at, eligibility, metadata')
        .eq('id', requestedRewardId)
        .eq('customer_id', customerId)
        .maybeSingle();
      if (rewardRes.error || !rewardRes.data) {
        return NextResponse.json({ error: 'That reward is not available for this customer.' }, { status: 404 });
      }
      const reward = rewardRes.data as Record<string, unknown>;
      const rewardMetadata = reward.metadata && typeof reward.metadata === 'object'
        ? reward.metadata as Record<string, unknown>
        : {};
      const rewardSource = String(
        rewardMetadata.source ?? rewardMetadata.program ?? rewardMetadata.reward_source ?? rewardMetadata.issuance_type ?? '',
      ).toLowerCase();
      selectedRewardKind = rewardSource.includes('loyalty') || rewardSource.includes('punch') ? 'loyalty' : 'referral';
      const rewardStatus = String(reward.status ?? '');
      if (rewardStatus === 'selected') {
        const selectedAt = Date.parse(String(rewardMetadata.selected_at ?? ''));
        if (!Number.isFinite(selectedAt) || selectedAt > Date.now() - 30 * 60 * 1000) {
          return NextResponse.json({ error: 'That reward is already being used in another booking.' }, { status: 409 });
        }
        await admin.from('referral_rewards').update({ status: 'available' }).eq('id', requestedRewardId).eq('status', 'selected');
      }
      if (!['issued', 'available', 'selected'].includes(rewardStatus)) {
        return NextResponse.json({ error: 'That reward has already been reserved, redeemed, expired, or voided.' }, { status: 409 });
      }
      if (reward.expires_at && String(reward.expires_at) < new Date().toISOString()) {
        await admin.from('referral_rewards').update({ status: 'expired' }).eq('id', requestedRewardId);
        return NextResponse.json({ error: 'That reward has expired.' }, { status: 409 });
      }
      const eligibility = reward.eligibility && typeof reward.eligibility === 'object'
        ? reward.eligibility as Record<string, unknown>
        : {};
      const stringList = (value: unknown) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
      const eligibleServices = stringList(eligibility.eligible_service_slugs ?? eligibility.eligibleServiceSlugs);
      const eligibleAddons = stringList(eligibility.eligible_addon_slugs ?? eligibility.eligibleAddonSlugs);
      const allowedVehicles = stringList(eligibility.vehicle_restrictions ?? eligibility.vehicleRestrictions).map((item) => normalizeVehicleClass(item));
      const exclusions = new Set(stringList(eligibility.exclusions));
      const stackingAllowed = eligibility.stacking_allowed === true || eligibility.stackingAllowed === true;
      if (!stackingAllowed && (quote.promo.applied || referralDiscountCents > 0)) {
        return NextResponse.json({ error: 'This reward cannot be combined with the selected promotion or referral discount.' }, { status: 409 });
      }
      const serviceCategory = String(eligibility.service_category ?? eligibility.serviceCategory ?? '').trim();
      let categoryEligibleSlugs: string[] = [];
      if (serviceCategory) {
        const categoryResult = await admin.from('services').select('slug').ilike('category', serviceCategory).eq('active', true);
        categoryEligibleSlugs = (categoryResult.data ?? []).map((row) => String(row.slug));
      }
      const selectedLine = resolved.find((line) =>
        (eligibleServices.length === 0 || eligibleServices.includes(line.serviceSlug)) &&
        (!serviceCategory || categoryEligibleSlugs.includes(line.serviceSlug)) &&
        (allowedVehicles.length === 0 || allowedVehicles.includes(normalizeVehicleClass(line.vehicleClass))) &&
        !exclusions.has(line.serviceSlug),
      );
      const selectedAddon = addOns.find((slug) =>
        (eligibleAddons.length === 0 || eligibleAddons.includes(slug)) && !exclusions.has(slug),
      ) ?? null;
      const rewardType = String(reward.reward_type ?? '');
      if ((rewardType === 'free_service' || eligibleServices.length > 0 || allowedVehicles.length > 0) && !selectedLine) {
        return NextResponse.json({ error: 'Choose an eligible service and vehicle for this reward.' }, { status: 409 });
      }
      if (rewardType === 'free_addon' && !selectedAddon) {
        return NextResponse.json({ error: 'Choose an eligible add-on before applying this reward.' }, { status: 409 });
      }
      const maximumRetailCents = Math.max(0, Number(eligibility.maximum_retail_cents ?? eligibility.maximumRetailCents ?? 0) || 0);
      const customerPaysDifference = eligibility.customer_pays_difference === true || eligibility.customerPaysDifference === true;
      let discountCents = 0;
      if (rewardType === 'percent') {
        const percentageBase = (eligibleServices.length > 0 || serviceCategory || allowedVehicles.length > 0) && selectedLine
          ? Math.max(0, Number(selectedLine.priceCents ?? 0))
          : adjustedTotalCents;
        discountCents = Math.round(percentageBase * Math.max(0, Number(reward.reward_value ?? 0)) / 100);
      } else if (rewardType === 'free_service') {
        discountCents = Math.max(0, Number(selectedLine?.priceCents ?? 0));
      } else if (rewardType === 'free_addon') {
        const pricedWithAddOns = priced as unknown as { addOnLines?: Array<{ slug?: string; cents?: number }> };
        const addOnLines = Array.isArray(pricedWithAddOns.addOnLines)
          ? pricedWithAddOns.addOnLines
          : [];
        const selectedAddOnLine = addOnLines.find((line) => String(line.slug ?? '') === selectedAddon);
        discountCents = Math.max(0, Number(selectedAddOnLine?.cents ?? 0));
      } else if (rewardType === 'custom') {
        discountCents = Math.round(Math.max(0, Number(reward.reward_value ?? 0)) * 100);
      } else {
        return NextResponse.json({ error: 'Use dollar and membership credits from the credit balance control during booking.' }, { status: 409 });
      }
      if (maximumRetailCents > 0 && discountCents > maximumRetailCents && !customerPaysDifference) {
        return NextResponse.json({ error: 'Choose an eligible option within this reward’s maximum retail value.' }, { status: 409 });
      }
      if (maximumRetailCents > 0) discountCents = Math.min(discountCents, maximumRetailCents);
      discountCents = Math.min(adjustedTotalCents, discountCents);
      if (discountCents <= 0 && rewardType !== 'custom') {
        return NextResponse.json({ error: 'This reward does not apply to the selected booking.' }, { status: 409 });
      }
      adjustedTotalCents = Math.max(0, adjustedTotalCents - discountCents);
      priced.finalTotalCents = adjustedTotalCents;
      depositAmountCents = paymentChoice === 'full' ? adjustedTotalCents : Math.min(priced.depositCents, adjustedTotalCents);
      selectedReward = {
        id: requestedRewardId,
        discountCents,
        serviceSlug: selectedLine?.serviceSlug ?? null,
        addonSlug: selectedAddon,
        metadata: reward.metadata && typeof reward.metadata === 'object' ? reward.metadata as Record<string, unknown> : {},
      };
    }

    const policyDecision = evaluateDiscountPolicy(discountPolicy, {
      originalTotalCents: priced.prePromoCents,
      totalAfterPromotionalDiscountsCents: adjustedTotalCents,
      requestedCreditCents,
      serviceSlugs: resolved.map((line) => line.serviceSlug),
      promoCodes: [
        promoCode || null,
        claimed ? `OFFER:${claimed.offerId}` : null,
        priced.websitePromoDiscountCents > 0 ? 'WEBSITE_PROMO' : null,
      ].filter((value): value is string => Boolean(value)),
      hasOfferOrSitePromo:
        Boolean(claimed) ||
        priced.offerDiscountCents > 0 ||
        priced.websitePromoDiscountCents > 0 ||
        priced.promoDiscountCents > 0,
      hasMembershipDiscount: priced.membershipDiscountCents > 0,
      hasReferralDiscount: referralDiscountCents > 0,
      hasReward: Boolean(selectedReward),
      rewardKind: selectedRewardKind,
      customerId,
      customerEmail: emailNorm,
    });
    if (!policyDecision.ok) {
      return NextResponse.json(
        { error: policyDecision.error, code: 'DISCOUNT_POLICY_BLOCKED' },
        { status: 409 },
      );
    }

    let campaignId: string | null = null;
    let campaignRecipientId: string | null = null;
    const campaignToken = String(body.campaignRecipientToken ?? '').trim();
    if (campaignToken && /^[a-f0-9]{24,80}$/i.test(campaignToken)) {
      const { data: campaignRecipient } = await admin.from('customer_campaign_recipients').select('id,campaign_id,status').eq('tracking_token', campaignToken).maybeSingle();
      if (campaignRecipient && !['excluded','opted_out','canceled','permanent_failure'].includes(String(campaignRecipient.status))) {
        const { data: campaign } = await admin.from('customer_campaigns').select('id,status,expires_at').eq('id', campaignRecipient.campaign_id).maybeSingle();
        if (campaign && !['canceled','failed'].includes(String(campaign.status)) && (!campaign.expires_at || Date.parse(campaign.expires_at) > Date.now())) {
          campaignId = String(campaign.id);
          campaignRecipientId = String(campaignRecipient.id);
        }
      }
    }
    const isQaTest = policyDecision.isQaTest || freePromoApplied || testOneDollar;

    if (selectedReward) {
      const lock = await admin
        .from('referral_rewards')
        .update({
          status: 'selected',
          selected_service_slug: selectedReward.serviceSlug,
          selected_addon_slug: selectedReward.addonSlug,
          metadata: { ...selectedReward.metadata, selected_at: new Date().toISOString() },
        })
        .eq('id', selectedReward.id)
        .eq('customer_id', customerId!)
        .in('status', ['issued', 'available'])
        .select('id')
        .maybeSingle();
      if (lock.error || !lock.data?.id) {
        return NextResponse.json({ error: 'That reward was just selected in another booking. Refresh your reward wallet.' }, { status: 409 });
      }
    }

    const vehicleDescriptionJoined = resolved.map((r) => r.vehicleDescription).join(' · ');
    const bookingVehicles = resolved.map((r) => ({
      service_slug: r.serviceSlug,
      vehicle_class: r.vehicleClass,
      vehicle_description: r.vehicleDescription,
      vehicle_color: r.vehicleColor || null,
      price_cents: r.priceCents,
      add_on_slugs: r.addOnSlugs ?? [],
    }));

    const serviceAddressFull = [serviceAddress, serviceCity, serviceState, serviceZip].filter(Boolean).join(', ');
    const orderSnapshot = buildBookingOrderSnapshot({
      guestName: guestName.trim(),
      guestEmail: emailNorm,
      guestPhone: phoneDigits,
      serviceAddress: serviceAddressFull,
      scheduledStart: scheduled.toISOString(),
      vehicles: bookingVehicles.map((v) => ({
        serviceSlug: v.service_slug,
        vehicleClass: v.vehicle_class,
        vehicleDescription: v.vehicle_description,
        vehicleColor: v.vehicle_color ?? '',
        priceCents: v.price_cents,
      })),
      addOnSlugs: addOns,
      addOnCents: priced.addOnSubtotalCents,
      promoCode: promoCode || null,
      paymentChoice,
      pricing: priced,
    });
    const breakdownWithSnapshot = {
      ...mergeSnapshotIntoBreakdown(priced, orderSnapshot),
      requested_credit_cents: requestedCreditCents,
      referral_code: referralCode || null,
      referrer_customer_id: referrerCustomerId,
      referral_discount_cents: referralDiscountCents,
      referral_reward_id: selectedReward?.id ?? null,
      referral_reward_discount_cents: selectedReward?.discountCents ?? 0,
      discount_policy: {
        active_mechanisms: policyDecision.activeMechanisms,
        combined_discount_cents: policyDecision.combinedDiscountCents,
        qa_test: isQaTest,
        qa_reason: policyDecision.qaReason,
      },
    };

    const insertPayload: Record<string, unknown> = {
      guest_email: emailNorm,
      guest_phone: phoneDigits,
      guest_name: guestName,
      vehicle_description: vehicleDescriptionJoined,
      service_slug: primary.serviceSlug,
      vehicle_class: primary.vehicleClass,
      base_price_cents: adjustedTotalCents,
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
      balance_due_cents: paymentChoice === 'full' || freePromoApplied ? 0 : Math.max(0, adjustedTotalCents - depositAmountCents),
      promo_code: promoCode || null,
      comp_reason: freePromoApplied
        ? `${promoCode || 'FREE'} comp applied`
        : testOneDollar
          ? 'TEST1 $1 Stripe test checkout'
          : null,
      booking_vehicles: bookingVehicles,
      booking_pricing_breakdown: breakdownWithSnapshot,
      booking_add_ons: addOns,
      booking_source: 'online',
      is_test: isQaTest,
      sms_consent: smsConsent,
      sms_consent_source: smsConsentSource,
      sms_consent_timestamp: smsConsentTimestamp,
      sms_consent_ip: smsConsentIp,
      sms_consent_user_agent: smsConsentUserAgent,
      sms_consent_text: SMS_CONSENT_COPY,
      sms_status: normalizeSmsConsentStatus(smsConsent),
      sms_opt_out_timestamp: smsConsent ? null : smsConsentTimestamp,
    };
    if (customerId) insertPayload.customer_id = customerId;
    if (offerRowId) insertPayload.offer_id = offerRowId;
    if (campaignId) {
      insertPayload.campaign_id = campaignId;
      insertPayload.campaign_recipient_id = campaignRecipientId;
      insertPayload.campaign_tracking_token = campaignToken;
    }

    const { data: appointment, error: apptErr } = await insertAppointmentResilient(admin, insertPayload);

    if (apptErr || !appointment) {
      if (selectedReward) {
        await admin.from('referral_rewards').update({ status: 'available' }).eq('id', selectedReward.id).eq('status', 'selected');
      }
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

    if (campaignId && campaignRecipientId) {
      const bookedAt = new Date().toISOString();
      await Promise.all([
        admin.from('customer_campaign_recipients').update({ status: 'booked', booked_at: bookedAt, booked_appointment_id: String(appointment.id), updated_at: bookedAt }).eq('id', campaignRecipientId),
        admin.from('customer_campaign_events').insert({ campaign_id: campaignId, recipient_id: campaignRecipientId, customer_id: customerId, appointment_id: String(appointment.id), event_type: 'booked', meta: { source: 'online_booking' } }),
      ]);
    }

    queueGoogleCalendarSync(admin, String(appointment.id), 'upsert');
    void import('@/lib/booking-availability-block').then(({ upsertAppointmentAvailabilityBlock }) =>
      upsertAppointmentAvailabilityBlock(admin, String(appointment.id)).catch((e) =>
        console.warn('[api/bookings] availability block', e),
      ),
    );

    const appliedCreditCents = await applyCustomerCreditsToAppointment({
      admin,
      customerId,
      appointmentId: String(appointment.id),
      requestedCents: requestedCreditCents,
      totalCents: adjustedTotalCents,
    });

    if (selectedReward) {
      const reserveResult = await admin
        .from('referral_rewards')
        .update({
          status: 'reserved',
          selected_service_slug: selectedReward.serviceSlug,
          selected_addon_slug: selectedReward.addonSlug,
          reserved_appointment_id: String(appointment.id),
          metadata: {
            ...selectedReward.metadata,
            booking_discount_cents: selectedReward.discountCents,
            reserved_at: new Date().toISOString(),
          },
        })
        .eq('id', selectedReward.id)
        .eq('customer_id', customerId!)
        .eq('status', 'selected');
      if (reserveResult.error) {
        console.error('[api/bookings] reward reservation failed', reserveResult.error.message);
        return NextResponse.json({ error: 'The booking was saved, but the reward could not be reserved. Contact Gloss Boss before paying.' }, { status: 409 });
      }
    }

    await logSmsConsentChange(admin, {
      customerId,
      appointmentId: String(appointment.id),
      source: smsConsentSource,
      newConsent: smsConsent,
      ip: smsConsentIp,
      userAgent: smsConsentUserAgent,
      note: 'Public booking form SMS consent. Consent is optional and not required to book.',
    });

    if (promoCode && quote.promo.applied) {
      await incrementPromoUse(admin, promoCode);
    }

    if (referralCode && referrerCustomerId) {
      const { recordReferralEvent } = await import('@/lib/referral/referral-events');
      const { sendReferralNotification } = await import('@/lib/referral/referral-notifications');
      await recordReferralEvent(admin, {
        referralCode,
        referrerCustomerId,
        status: 'booked',
        referredEmail: emailNorm,
        referredCustomerId: customerId,
        appointmentId: String(appointment.id),
        metadata: { source: 'public_booking', discount_cents: referralDiscountCents },
      });
      void sendReferralNotification(admin, {
        kind: 'someone_booked',
        customerId: referrerCustomerId,
        referralCode,
        referredName: guestName.trim(),
      });
      const { processReferralJobCompletion } = await import('@/lib/referral/referral-completion');
      const referralReward = await processReferralJobCompletion(admin, String(appointment.id));
      if (!referralReward.ok) {
        console.warn('[api/bookings] referral reward processing failed', referralReward.error);
      }
    }

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

      void notifyBusinessNewBookingQueued({
        eventKind: 'free_booking',
        guestName: guestName.trim(),
        guestEmail: emailNorm,
        guestPhone: phoneDigits,
        whenIso: scheduled.toISOString(),
        totalCents: priced.finalTotalCents,
        depositCents: 0,
        balanceCents: 0,
        appointmentId: appointment.id,
        vehicles: vehicleDescriptionJoined,
        serviceAddress: [serviceAddress, serviceCity, serviceState, serviceZip].filter(Boolean).join(', '),
        comped: true,
      }).catch((e) => console.warn('[api/bookings] FREE owner notify', e));

      return NextResponse.json({
        appointmentId: appointment.id,
        accessToken: appointment.access_token,
        depositAmountCents: 0,
        appliedCreditCents,
        skipPayment: true,
        compStatus: 'test_comped',
        message: 'FREE test comp applied',
      });
    }

    /* Booking confirmation + deposit receipt emails send after Stripe checkout via notifyBookingCheckoutPaid. */

    const isFullCovered = paymentChoice === 'full' ? (appliedCreditCents >= totalBaseCents) : (appliedCreditCents >= depositAmountCents);

    if (isFullCovered) {
      const newStatus = paymentChoice === 'full' ? 'confirmed' : 'deposit_paid';
      const newPaymentStatus = paymentChoice === 'full' ? 'full_paid' : 'deposit_paid';
      await admin
        .from('appointments')
        .update({
          status: newStatus,
          payment_status: newPaymentStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.id);

      void notifyBookingConfirmationQueued({
        toEmail: emailNorm,
        toPhone: phoneDigits,
        guestName: guestName.trim(),
        whenIso: scheduled.toISOString(),
        totalCents: totalBaseCents,
        depositCents: depositAmountCents,
        vehicles: vehicleDescriptionJoined,
        appointmentId: appointment.id,
      }).catch(() => {});

      const hasCeramic = resolved.some((r) => r.serviceSlug === 'ceramic-coating');
      void notifyBusinessNewBookingQueued({
        eventKind: hasCeramic ? 'ceramic_quote' : 'new_booking',
        guestName: guestName.trim(),
        guestEmail: emailNorm,
        guestPhone: phoneDigits,
        whenIso: scheduled.toISOString(),
        totalCents: priced.finalTotalCents,
        depositCents: depositAmountCents,
        balanceCents: Math.max(0, priced.finalTotalCents - appliedCreditCents),
        appointmentId: appointment.id,
        vehicles: vehicleDescriptionJoined,
        serviceAddress: [serviceAddress, serviceCity, serviceState, serviceZip].filter(Boolean).join(', '),
        comped: false,
      }).catch((e) => console.warn('[api/bookings] owner notify', e));

      return NextResponse.json({
        appointmentId: appointment.id,
        accessToken: appointment.access_token,
        depositAmountCents: depositAmountCents,
        appliedCreditCents,
        skipPayment: true,
      });
    }

    const hasCeramic = resolved.some((r) => r.serviceSlug === 'ceramic-coating');
    // Owner/tech confirmation notifications fire only after Stripe confirms payment
    // (see notifyBookingCheckoutPaid). Do not notify on checkout_started / awaiting_payment.
    void hasCeramic;

    return NextResponse.json({
      appointmentId: appointment.id,
      accessToken: appointment.access_token,
      depositAmountCents: depositAmountCents,
      appliedCreditCents,
      status: 'payment_pending',
    });
  } catch (e) {
    console.error('[api/bookings] unexpected', e);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

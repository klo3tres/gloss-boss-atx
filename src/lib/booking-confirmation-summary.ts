import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverableCustomerEmail } from '@/lib/customer-contact';
import { enabledExternalPaymentMethods, loadExternalPaymentSettings } from '@/lib/external-payment-settings';
import { loadOrderSnapshot } from '@/lib/order-snapshot-engine';
import { vehiclesFromRow, type Row } from '@/lib/work-order-resolve';
import { reconcilePricingDisplay } from '@/lib/pricing-display-invariants';

function str(value: unknown) {
  return value == null ? '' : String(value).trim();
}

export async function loadBookingConfirmationSummary(
  admin: SupabaseClient,
  appointmentId: string,
) {
  const { data: appointment } = await admin
    .from('appointments')
    .select('id, access_token, status, guest_name, guest_email, guest_phone, scheduled_start, payment_status, payment_choice, promo_code, job_started_at, job_completed_at, archived_at, deleted_at')
    .eq('id', appointmentId)
    .maybeSingle();
  if (!appointment) return null;

  const snapshot = await loadOrderSnapshot(admin, { appointmentId });
  const job = appointment as Row;
  const vehicles = snapshot?.vehicles ?? vehiclesFromRow(job).map((vehicle, index) => ({
    description: str(vehicle.vehicle_description || vehicle.description) || `Vehicle ${index + 1}`,
    serviceSlug: str(vehicle.service_slug),
    vehicleClass: str(vehicle.vehicle_class),
    priceCents: typeof vehicle.price_cents === 'number' ? vehicle.price_cents : 0,
    addOns: [] as Array<{ label: string; priceCents: number }>,
  }));

  if (snapshot) {
    for (let index = 0; index < snapshot.vehicles.length; index++) {
      const canonicalVehiclePrice = snapshot.pricing.vehicleLines[index]?.priceCents;
      vehicles[index] = {
        description: snapshot.vehicles[index]!.description,
        serviceSlug: snapshot.vehicles[index]!.serviceSlug,
        vehicleClass: snapshot.vehicles[index]!.vehicleClass,
        priceCents:
          typeof canonicalVehiclePrice === 'number' && canonicalVehiclePrice > 0
            ? canonicalVehiclePrice
            : snapshot.vehicles[index]!.priceCents,
        addOns: snapshot.vehicles[index]!.addOns.map((addOn) => ({
          label: addOn.label,
          priceCents: addOn.priceCents,
        })),
      };
    }
  }

  const pricing = snapshot?.pricing;
  const [{ data: agreement }, { data: intake }, { data: customer }, externalPaymentSettings] = await Promise.all([
    admin.from('signed_agreements').select('id').eq('appointment_id', appointmentId).limit(1).maybeSingle(),
    admin.from('intake_submissions').select('id, form_data').eq('appointment_id', appointmentId).limit(1).maybeSingle(),
    snapshot?.refs.customerId
      ? admin.from('customers').select('id, auth_user_id').eq('id', snapshot.refs.customerId).maybeSingle()
      : Promise.resolve({ data: null }),
    loadExternalPaymentSettings(admin),
  ]);
  const customerId = snapshot?.refs.customerId || '';
  const [creditsResult, loyaltyResult, rewardsResult, referralCodeResult] = await Promise.all([
    customerId
      ? admin.from('customer_credits').select('remaining_cents, status').eq('customer_id', customerId)
      : Promise.resolve({ data: [] }),
    customerId
      ? admin.from('loyalty_stamps').select('stamp_count, voided').eq('customer_id', customerId)
      : Promise.resolve({ data: [] }),
    customerId
      ? admin.from('referral_rewards').select('status').eq('customer_id', customerId)
      : Promise.resolve({ data: [] }),
    customerId
      ? admin.from('customer_referral_codes').select('code').eq('customer_id', customerId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const credits = (creditsResult.data ?? []) as Array<{ remaining_cents?: number; status?: string }>;
  const loyalty = (loyaltyResult.data ?? []) as Array<{ stamp_count?: number; voided?: boolean }>;
  const rewards = (rewardsResult.data ?? []) as Array<{ status?: string }>;
  const status = str(job.status).toLowerCase();
  const appointmentActive =
    !['cancelled', 'canceled', 'voided', 'deleted', 'archived', 'no_show'].includes(status) &&
    !job.archived_at &&
    !job.deleted_at;
  const scheduledTime = new Date(str(job.scheduled_start)).getTime();
  const customerCanModify =
    appointmentActive &&
    !job.job_started_at &&
    !job.job_completed_at &&
    !['in_progress', 'completed'].includes(status) &&
    !Number.isNaN(scheduledTime) &&
    scheduledTime > Date.now();
  const intakeForm =
    intake?.form_data && typeof intake.form_data === 'object'
      ? (intake.form_data as Record<string, unknown>)
      : null;
  const acknowledgementCompleted = Boolean(agreement || intakeForm?.deposit_legal_ack);
  const depositRequired = (pricing?.depositCents ?? 0) > 0;
  const depositPaid =
    depositRequired &&
    (pricing?.depositPaidCents ?? 0) >= (pricing?.depositCents ?? 0);
  const paidInFull =
    (pricing?.finalTotalCents ?? 0) > 0 &&
    (pricing?.totalPaidCents ?? 0) >= (pricing?.finalTotalCents ?? 0);
  const paymentChoice = str(job.payment_choice).toLowerCase();
  const payOnArrival = paymentChoice === 'pay_later' || paymentChoice === 'pay_on_arrival';
  const depositDueCents = Math.max(
    0,
    (pricing?.depositCents ?? 0) - (pricing?.depositPaidCents ?? 0),
  );
  const reconciledPricing = reconcilePricingDisplay({
    vehicleSubtotalCents: pricing?.vehicleSubtotalCents ?? 0,
    addOnSubtotalCents: pricing?.addOnSubtotalCents ?? 0,
    prePromoCents: pricing?.prePromoCents ?? 0,
    finalTotalCents: pricing?.finalTotalCents ?? 0,
    onlineDiscountCents: pricing?.onlineDiscountCents ?? 0,
    multiCarDiscountCents: pricing?.multiCarDiscountCents ?? 0,
    promoDiscountCents: pricing?.promoDiscountCents ?? 0,
    manualDiscountCents: pricing?.manualDiscountCents ?? 0,
  });
  const nextStep = !appointmentActive
    ? 'inactive'
    : !acknowledgementCompleted
      ? 'acknowledgement'
      : depositRequired && !depositPaid && !paidInFull && !payOnArrival
        ? 'payment'
        : 'confirmation';

  const canonicalPaymentStatus = snapshot?.paymentStatus ?? str(job.payment_status).toLowerCase();

  return {
    bookingNumber: appointmentId.slice(0, 8).toUpperCase(),
    guestName: snapshot?.customer.name ?? str(job.guest_name),
    guestEmail: deliverableCustomerEmail(snapshot?.customer.email ?? job.guest_email),
    guestPhone: snapshot?.customer.phone ?? str(job.guest_phone),
    scheduledStart: snapshot?.scheduledStart ?? str(job.scheduled_start),
    serviceAddress: snapshot?.serviceAddress ?? '',
    vehicles,
    promoCode: snapshot?.promoCode ?? (str(job.promo_code) || null),
    serviceSubtotalCents: reconciledPricing.serviceSubtotalCents,
    finalTotalCents: pricing?.finalTotalCents ?? 0,
    depositCents: pricing?.depositCents ?? 0,
    depositPaidCents: pricing?.depositPaidCents ?? 0,
    depositDueCents,
    totalPaidCents: pricing?.totalPaidCents ?? 0,
    balanceDueCents: pricing?.remainingBalanceCents ?? 0,
    paymentStatus: snapshot?.paymentStatus ?? str(job.payment_status),
    paymentStatusLabel: snapshot?.paymentStatusLabel ?? str(job.payment_status).replace(/_/g, ' '),
    externalPaymentMethods: enabledExternalPaymentMethods(externalPaymentSettings),
    onlineDiscountCents: pricing?.onlineDiscountCents ?? 0,
    multiCarDiscountCents: pricing?.multiCarDiscountCents ?? 0,
    promoDiscountCents: pricing?.promoDiscountCents ?? 0,
    manualDiscountCents: pricing?.manualDiscountCents ?? 0,
    pricingAdjustmentCents: reconciledPricing.pricingAdjustmentCents,
    customerBenefits: {
      loyaltyPunches: loyalty.reduce(
        (sum, item) => sum + (item.voided ? 0 : Math.max(0, Number(item.stamp_count ?? 1))),
        0,
      ),
      activeCreditsCents: credits
        .filter((item) => ['active', 'partially_used'].includes(str(item.status)))
        .reduce((sum, item) => sum + Math.max(0, Number(item.remaining_cents ?? 0)), 0),
      availableRewards: rewards.filter((item) =>
        ['pending', 'issued', 'available'].includes(str(item.status)),
      ).length,
      redeemedRewards: rewards.filter((item) => str(item.status) === 'redeemed').length,
      referralCode: str(referralCodeResult.data?.code) || null,
    },
    sessionState: {
      bookingExists: true,
      appointmentActive,
      acknowledgementCompleted,
      depositRequired,
      depositPaid,
      paidInFull,
      payOnArrival,
      paymentChoice,
      paymentFailed: canonicalPaymentStatus === 'failed',
      paymentCancelled: canonicalPaymentStatus === 'cancelled',
      paymentExpired: canonicalPaymentStatus === 'expired',
      accountClaimed: Boolean(customer?.auth_user_id),
      workOrderCreated: Boolean(snapshot?.refs.workOrderId),
      canReschedule: customerCanModify,
      canCancel: customerCanModify,
      nextStep: nextStep as 'inactive' | 'acknowledgement' | 'payment' | 'confirmation',
    },
  };
}

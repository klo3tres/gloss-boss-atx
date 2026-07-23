import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CampaignAudienceFilters, CampaignAudienceRecipient } from '@/lib/campaigns/types';

type Row = Record<string, unknown>;

function str(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function time(value: unknown) {
  const parsed = Date.parse(str(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isCollected(row: Row) {
  return ['paid', 'succeeded'].includes(str(row.status).toLowerCase()) && !row.voided_at && row.exclude_from_revenue !== true && row.is_test !== true;
}

export async function loadCampaignAudience(
  admin: SupabaseClient,
  input: { filters?: CampaignAudienceFilters; page?: number; pageSize?: number },
) {
  const filters = input.filters ?? {};
  const page = Math.max(1, Number(input.page ?? 1));
  const pageSize = Math.max(10, Math.min(2500, Number(input.pageSize ?? 50)));
  const now = Date.now();

  let customerQuery = admin
    .from('customers')
    .select('id, full_name, email, phone, sms_consent, sms_status, email_marketing_opt_in, created_at, updated_at')
    .limit(2500);
  const search = str(filters.search);
  if (search) customerQuery = customerQuery.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);

  const [customersRes, appointmentsRes, paymentsRes, membershipsRes, loyaltyRes] = await Promise.all([
    customerQuery.order('updated_at', { ascending: false }),
    admin.from('appointments').select('id, customer_id, guest_email, status, scheduled_start, job_completed_at, completed_at, service_slug, vehicle_description, booking_vehicles, service_city, base_price_cents, is_test').order('scheduled_start', { ascending: false }).limit(7500),
    admin.from('payments').select('customer_id, amount_cents, refunded_amount_cents, status, voided_at, exclude_from_revenue, is_test, paid_at').order('paid_at', { ascending: false }).limit(7500),
    admin.from('customer_memberships').select('customer_id, status, membership_plan_id').eq('status', 'active').limit(2500),
    admin.from('loyalty_stamps').select('customer_id, stamp_count').limit(5000),
  ]);

  const customers = (customersRes.data ?? []) as Row[];
  const appointments = (appointmentsRes.data ?? []) as Row[];
  const payments = (paymentsRes.data ?? []) as Row[];
  const memberByCustomer = new Map<string, Row>();
  for (const row of (membershipsRes.data ?? []) as Row[]) memberByCustomer.set(str(row.customer_id), row);
  const loyaltyByCustomer = new Map<string, number>();
  for (const row of (loyaltyRes.data ?? []) as Row[]) {
    const id = str(row.customer_id);
    loyaltyByCustomer.set(id, (loyaltyByCustomer.get(id) ?? 0) + Number(row.stamp_count ?? 1));
  }
  const apptsByCustomer = new Map<string, Row[]>();
  for (const row of appointments) {
    const id = str(row.customer_id);
    if (!id || row.is_test === true) continue;
    apptsByCustomer.set(id, [...(apptsByCustomer.get(id) ?? []), row]);
  }
  const paidByCustomer = new Map<string, number[]>();
  for (const row of payments) {
    const id = str(row.customer_id);
    if (!id || !isCollected(row)) continue;
    const net = Math.max(0, Number(row.amount_cents ?? 0) - Number(row.refunded_amount_cents ?? 0));
    paidByCustomer.set(id, [...(paidByCustomer.get(id) ?? []), net]);
  }

  const mapped: CampaignAudienceRecipient[] = [];
  const optedOutPhones = new Set(customers.filter((row) => row.sms_consent === false || str(row.sms_status).toLowerCase() === 'opted_out').map((row) => str(row.phone).replace(/\D/g, '').slice(-10)).filter(Boolean));
  for (const customer of customers) {
    const customerId = str(customer.id);
    if (!customerId) continue;
    const history = (apptsByCustomer.get(customerId) ?? []).sort((a, b) => time(b.scheduled_start) - time(a.scheduled_start));
    const completed = history.filter((row) => ['completed', 'paid'].includes(str(row.status).toLowerCase()) || time(row.job_completed_at) > 0 || time(row.completed_at) > 0);
    const last = completed[0] ?? history[0];
    const lastCompletedAt = str(last?.job_completed_at ?? last?.completed_at ?? (completed.length ? last?.scheduled_start : '')) || null;
    const daysSince = lastCompletedAt ? Math.max(0, Math.floor((now - time(lastCompletedAt)) / 86400000)) : null;
    const future = history.some((row) => time(row.scheduled_start) > now && !['cancelled', 'canceled', 'missed', 'no_show'].includes(str(row.status).toLowerCase()));
    const hadCancellation = history.some((row) => ['cancelled', 'canceled'].includes(str(row.status).toLowerCase()));
    const hadMissedAppointment = history.some((row) => ['missed', 'no_show'].includes(str(row.status).toLowerCase()));
    const vehicles = Array.isArray(last?.booking_vehicles) ? last.booking_vehicles as Array<Record<string, unknown>> : [];
    const vehicleLabels = vehicles.map((vehicle) => str(vehicle.vehicle_description ?? vehicle.description ?? vehicle.vehicle_class)).filter(Boolean);
    const vehicle = vehicleLabels[0] || str(last?.vehicle_description) || 'your vehicle';
    const vehicleCount = Math.max(1, vehicleLabels.length || (history.length ? 1 : 0));
    const lastService = str(last?.service_slug).replace(/-/g, ' ') || 'detail service';
    const city = str(last?.service_city) || 'Austin';
    const paid = paidByCustomer.get(customerId) ?? [];
    const lifetimeValueCents = paid.reduce((sum, value) => sum + value, 0);
    const averageSpendCents = paid.length ? Math.round(lifetimeValueCents / paid.length) : 0;
    const membership = memberByCustomer.get(customerId);
    const loyaltyCount = loyaltyByCustomer.get(customerId) ?? 0;
    const phone = str(customer.phone) || null;
    const email = str(customer.email).toLowerCase() || null;
    const phoneDigits = str(phone).replace(/\D/g, '').slice(-10);
    const canSms = Boolean(phone && customer.sms_consent === true && str(customer.sms_status).toLowerCase() === 'opted_in' && !optedOutPhones.has(phoneDigits));
    const smsReason = !phone ? 'No phone number' : optedOutPhones.has(phoneDigits) ? 'Customer opted out of SMS' : customer.sms_consent !== true || str(customer.sms_status).toLowerCase() !== 'opted_in' ? 'SMS consent is not opted in' : null;
    const canEmail = Boolean(email?.includes('@') && customer.email_marketing_opt_in !== false);
    const blockerReasons: string[] = [];
    if (!canSms) blockerReasons.push(`SMS: ${smsReason ?? 'not eligible'}`);
    if (!canEmail) blockerReasons.push('Email: missing address or marketing consent');

    mapped.push({
      customerId,
      name: str(customer.full_name) || email || phone || 'Customer',
      firstName: (str(customer.full_name).split(/\s+/)[0] || 'there'),
      email,
      phone,
      canSms,
      canEmail,
      blockerReasons,
      city,
      vehicle,
      vehicleCount,
      lastService,
      lastCompletedAt,
      daysSinceLastService: daysSince,
      hasFutureBooking: future,
      hadCancellation,
      hadMissedAppointment,
      membershipStatus: membership ? 'Active member' : 'Non-member',
      loyaltyProgress: loyaltyCount ? `${loyaltyCount} punch${loyaltyCount === 1 ? '' : 'es'}` : 'No punches yet',
      loyaltyCount,
      ceramicStatus: /ceramic/i.test(lastService) ? 'Ceramic customer' : 'No ceramic service recorded',
      averageSpendCents,
      lifetimeValueCents,
      visitCount: completed.length,
      serviceAreaDistanceMiles: null,
    });
  }

  const filtered = mapped.filter((row) => {
    const channelEligible = filters.channel === 'sms' ? row.canSms : filters.channel === 'email' ? row.canEmail : row.canSms || row.canEmail;
    if (!channelEligible) return false;
    if (filters.lastCompletedDays && (row.daysSinceLastService == null || row.daysSinceLastService > filters.lastCompletedDays)) return false;
    if (filters.city && !row.city.toLowerCase().includes(filters.city.toLowerCase())) return false;
    if (filters.service && !row.lastService.toLowerCase().includes(filters.service.toLowerCase())) return false;
    if (filters.vehicle && !row.vehicle.toLowerCase().includes(filters.vehicle.toLowerCase())) return false;
    if (filters.minLoyalty && row.loyaltyCount < filters.minLoyalty) return false;
    if (filters.minAverageSpendCents && row.averageSpendCents < filters.minAverageSpendCents) return false;
    if (filters.minLifetimeValueCents && row.lifetimeValueCents < filters.minLifetimeValueCents) return false;
    switch (filters.preset) {
      case 'recent': return row.daysSinceLastService != null && row.daysSinceLastService <= 90;
      case 'lapsed': return row.daysSinceLastService != null && row.daysSinceLastService >= 90 && !row.hasFutureBooking;
      case 'no_future': return !row.hasFutureBooking;
      case 'cancelled': return row.hadCancellation;
      case 'missed': return row.hadMissedAppointment;
      case 'members': return row.membershipStatus !== 'Non-member';
      case 'non_members': return row.membershipStatus === 'Non-member';
      case 'ceramic': return row.ceramicStatus === 'Ceramic customer';
      case 'multi_vehicle': return row.vehicleCount > 1;
      default: return true;
    }
  });

  const start = (page - 1) * pageSize;
  return {
    recipients: filtered.slice(start, start + pageSize),
    total: filtered.length,
    eligibleSms: filtered.filter((row) => row.canSms).length,
    eligibleEmail: filtered.filter((row) => row.canEmail).length,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(filtered.length / pageSize)),
  };
}

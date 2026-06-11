import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { CustomerDashboardClient } from '@/components/dashboard/customer-dashboard-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import {
  loadCustomerSnapshotForAppointment,
  type CustomerApptSnapshotView,
} from '@/lib/customer-dashboard-snapshot';



export const dynamic = 'force-dynamic';



type ApptRow = {

  id: string;

  status: string;

  scheduled_start: string;

  service_slug: string;

  vehicle_class: string;

  base_price_cents: number;

  deposit_amount_cents: number;

  job_started_at: string | null;

  job_completed_at: string | null;
  booking_vehicles?: unknown;
  service_address?: string | null;
  service_city?: string | null;
  service_state?: string | null;
  service_zip?: string | null;
  balance_due_cents?: number | null;
  payment_status?: string | null;
  guest_email?: string | null;

};



type TimelineRow = {

  appointment_id: string;

  event_type: string;

  created_at: string;

  meta: Record<string, unknown> | null;

};



type MediaRow = {

  appointment_id: string;

  file_url: string;

  category: string;

  visible_to_customer: boolean | null;

};

type PaymentRow = {
  appointment_id: string;
  amount_cents: number;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
};

type ReceiptRow = {
  appointment_id: string;
  receipt_number: string | null;
  amount_cents: number;
  payment_method: string | null;
  created_at: string;
};

type AgreementRow = {
  id: string;
  appointment_id: string;
  signed_at: string | null;
};

type CustomerMembershipView = {
  status: string;
  tier: string;
  name: string;
  billingInterval: string;
  priceCents: number;
  discountPercent: number;
  creditBalanceCents: number;
  currentPeriodEnd: string | null;
  endsAt: string | null;
  benefits: string[];
  includedServices: string[];
};

type ActiveDealView = {
  id: string;
  title: string;
  description: string;
  discount: string;
};



function friendlyEventLabel(t: string): string {

  return t.replace(/_/g, ' ');

}

function chicago(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch {
      return value.split('\n').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

async function loadActiveCustomerMembership(adminDb: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>, customerId: string): Promise<CustomerMembershipView | null> {
  const baseSelect =
    'id, membership_plan_id, status, ends_at, current_period_end, credit_balance_cents, billing_interval';
  let membershipRes = await adminDb
    .from('customer_memberships')
    .select(baseSelect)
    .eq('customer_id', customerId)
    .in('status', ['active', 'trialing', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipRes.error) {
    membershipRes = await adminDb
      .from('customer_memberships')
      .select('id, membership_plan_id, status, ends_at')
      .eq('customer_id', customerId)
      .in('status', ['active', 'trialing', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  const membership = membershipRes.data as Record<string, unknown> | null;
  if (!membership?.membership_plan_id) return null;

  const planRes = await adminDb
    .from('membership_plans')
    .select('id, name, tier, price_cents, billing_interval, discount_percent, benefits, included_services')
    .eq('id', String(membership.membership_plan_id))
    .maybeSingle();
  const plan = (planRes.data ?? {}) as Record<string, unknown>;

  return {
    status: String(membership.status ?? 'active'),
    tier: String(plan.tier ?? 'member'),
    name: String(plan.name ?? 'Gloss Boss Membership'),
    billingInterval: String(membership.billing_interval ?? plan.billing_interval ?? 'monthly'),
    priceCents: typeof plan.price_cents === 'number' ? plan.price_cents : 0,
    discountPercent: typeof plan.discount_percent === 'number' ? plan.discount_percent : 0,
    creditBalanceCents: typeof membership.credit_balance_cents === 'number' ? membership.credit_balance_cents : 0,
    currentPeriodEnd: typeof membership.current_period_end === 'string' ? membership.current_period_end : null,
    endsAt: typeof membership.ends_at === 'string' ? membership.ends_at : null,
    benefits: toStringList(plan.benefits),
    includedServices: toStringList(plan.included_services),
  };
}

async function loadCustomerDeals(adminDb: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>): Promise<ActiveDealView[]> {
  const now = new Date().toISOString();
  const { data, error } = await adminDb
    .from('promo_codes')
    .select('id, code, description, discount_type, discount_value, enabled, starts_at, ends_at, archived_at')
    .eq('enabled', true)
    .is('archived_at', null)
    .limit(8);
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => {
      const starts = typeof row.starts_at === 'string' ? row.starts_at : '';
      const ends = typeof row.ends_at === 'string' ? row.ends_at : '';
      return (!starts || starts <= now) && (!ends || ends >= now);
    })
    .map((row) => {
      const type = String(row.discount_type ?? 'percent');
      const value = Number(row.discount_value ?? 0);
      const discount = type === 'amount' ? `$${value.toFixed(2)} off` : type === 'comp' ? 'Free/comp offer' : `${value}% off`;
      return {
        id: String(row.id),
        title: String(row.code ?? 'Member offer'),
        description: String(row.description ?? 'Active Gloss Boss promotion'),
        discount,
      };
    });
}



export default async function CustomerDashboardRootPage() {

  const session = await getSessionWithProfile();

  const supabase = await createSupabaseServerClient();
  const adminDb = tryCreateAdminSupabase();



  let appointments: ApptRow[] = [];

  const eventsByAppt = new Map<string, TimelineRow[]>();

  const photosByAppt = new Map<string, MediaRow[]>();
  const paymentsByAppt = new Map<string, PaymentRow[]>();
  const receiptsByAppt = new Map<string, ReceiptRow[]>();
  const agreementByAppt = new Map<string, AgreementRow>();



  const userEmail = session.user?.email?.trim().toLowerCase() ?? '';

  if (supabase && session.user && userEmail) {
    let customerId = '';
    if (adminDb) {
      const { data: cust } = await adminDb.from('customers').select('id').ilike('email', userEmail).maybeSingle();
      customerId = cust?.id ? String(cust.id) : '';
    }

    let query = supabase
      .from('appointments')
      .select(
        'id, status, scheduled_start, service_slug, vehicle_class, booking_vehicles, service_address, service_city, service_state, service_zip, base_price_cents, deposit_amount_cents, balance_due_cents, payment_status, job_started_at, job_completed_at, guest_email',
      )
      .order('scheduled_start', { ascending: false })
      .limit(40);

    if (customerId) {
      query = query.or(`guest_email.eq.${userEmail},customer_id.eq.${customerId}`);
    } else {
      query = query.eq('guest_email', userEmail);
    }

    const { data } = await query;
    appointments = (data ?? []) as ApptRow[];



    const ids = appointments.map((a) => a.id);

    if (ids.length > 0) {

      const [evRes, medRes, payRes, agRes, receiptRes] = await Promise.all([

        supabase

          .from('job_timeline_events')

          .select('appointment_id, event_type, created_at, meta')

          .in('appointment_id', ids)

          .order('created_at', { ascending: false })

          .limit(400),

        supabase

          .from('job_media')

          .select('appointment_id, file_url, category, visible_to_customer')

          .in('appointment_id', ids)

          .order('created_at', { ascending: false })

          .limit(200),
        supabase
          .from('payments')
          .select('appointment_id, amount_cents, status, payment_method, paid_at')
          .in('appointment_id', ids)
          .order('paid_at', { ascending: false })
          .limit(100),
        supabase
          .from('signed_agreements')
          .select('id, appointment_id, signed_at')
          .in('appointment_id', ids)
          .order('signed_at', { ascending: false })
          .limit(100),
        supabase
          .from('receipts')
          .select('appointment_id, receipt_number, amount_cents, payment_method, created_at')
          .in('appointment_id', ids)
          .order('created_at', { ascending: false })
          .limit(100),

      ]);



      for (const row of (evRes.data ?? []) as TimelineRow[]) {

        const list = eventsByAppt.get(row.appointment_id) ?? [];

        if (list.length < 12) list.push(row);

        eventsByAppt.set(row.appointment_id, list);

      }



      for (const row of (medRes.data ?? []) as MediaRow[]) {

        if (!row.visible_to_customer) continue;

        const list = photosByAppt.get(row.appointment_id) ?? [];

        if (list.length < 8) list.push(row);

        photosByAppt.set(row.appointment_id, list);

      }

      for (const row of (payRes.data ?? []) as PaymentRow[]) {
        const list = paymentsByAppt.get(row.appointment_id) ?? [];
        list.push(row);
        paymentsByAppt.set(row.appointment_id, list);
      }

      for (const row of (agRes.data ?? []) as AgreementRow[]) {
        if (!agreementByAppt.has(row.appointment_id)) agreementByAppt.set(row.appointment_id, row);
      }

      for (const row of (receiptRes.data ?? []) as ReceiptRow[]) {
        const list = receiptsByAppt.get(row.appointment_id) ?? [];
        list.push(row);
        receiptsByAppt.set(row.appointment_id, list);
      }

    }

  }



  const now = Date.now();
  const history = appointments.filter((a) => ['completed', 'cancelled'].includes(a.status)).slice(0, 12);
  const inFlight = appointments.filter(
    (a) => !['completed', 'cancelled'].includes(a.status) && (a.status === 'in_progress' || (a.job_started_at && !a.job_completed_at)),
  );
  const pending = appointments.filter(
    (a) =>
      !['completed', 'cancelled', 'in_progress'].includes(a.status) &&
      !a.job_started_at &&
      ['awaiting_payment', 'pending', 'assigned', 'deposit_paid', 'confirmed'].includes(a.status),
  );
  const upcoming = appointments
    .filter((a) => !['completed', 'cancelled'].includes(a.status) && new Date(a.scheduled_start).getTime() >= now - 3600000)
    .filter((a) => !inFlight.some((j) => j.id === a.id))
    .slice(0, 8);

  const liveJob = inFlight[0] ?? upcoming.find((a) => a.status === 'in_progress' || (a.job_started_at && !a.job_completed_at)) ?? null;



  const liveEvents = liveJob ? eventsByAppt.get(liveJob.id) ?? [] : [];
  let vehicleTotal = appointments.reduce((sum, a) => sum + (Array.isArray(a.booking_vehicles) ? a.booking_vehicles.length : 1), 0);
  let loyaltyStampsCount = 0;
  let customerMembership: CustomerMembershipView | null = null;
  let accountCreditBalanceCents = 0;
  let activeDeals: ActiveDealView[] = [];
  let activeCardDesign = null;
  if (adminDb && userEmail) {
    const { data: cust } = await adminDb.from('customers').select('id').ilike('email', userEmail).maybeSingle();
    if (cust?.id) {
      const [{ count }, { data: stamps }] = await Promise.all([
        adminDb.from('vehicles').select('id', { count: 'exact', head: true }).eq('customer_id', cust.id),
        adminDb.from('loyalty_stamps').select('stamp_count').eq('customer_id', cust.id),
      ]);
      if (typeof count === 'number' && count > 0) vehicleTotal = count;
      loyaltyStampsCount = (stamps ?? []).reduce((sum, s) => sum + (s.stamp_count ?? 1), 0);
      customerMembership = await loadActiveCustomerMembership(adminDb, String(cust.id));
      const creditRes = await adminDb
        .from('customer_credits')
        .select('remaining_cents, status, expires_at')
        .eq('customer_id', cust.id)
        .in('status', ['active', 'partially_used'])
        .limit(500);
      if (!creditRes.error) {
        const nowIso = new Date().toISOString();
        accountCreditBalanceCents = (creditRes.data ?? []).reduce((sum, row) => {
          const expiresAt = typeof row.expires_at === 'string' ? row.expires_at : '';
          if (expiresAt && expiresAt < nowIso) return sum;
          return sum + (typeof row.remaining_cents === 'number' ? Math.max(0, row.remaining_cents) : 0);
        }, 0);
      }
      activeDeals = await loadCustomerDeals(adminDb);

      const tier = customerMembership?.tier || 'default';
      const { data: design } = await adminDb
        .from('loyalty_card_designs')
        .select('*')
        .eq('tier', tier)
        .eq('active', true)
        .eq('archived', false)
        .maybeSingle();
      activeCardDesign = design;

      if (!activeCardDesign && tier !== 'default') {
        const { data: defaultDesign } = await adminDb
          .from('loyalty_card_designs')
          .select('*')
          .eq('tier', 'default')
          .eq('active', true)
          .eq('archived', false)
          .maybeSingle();
        activeCardDesign = defaultDesign;
      }

      if (activeCardDesign) {
        activeCardDesign = {
          ...(activeCardDesign as Record<string, unknown>),
          tier: customerMembership?.tier || (activeCardDesign as Record<string, unknown>).tier || 'member',
          name: customerMembership?.name || (activeCardDesign as Record<string, unknown>).name || 'Gloss Boss Loyalty Card',
        };
      }
    }
  }
  const receiptTotal = Array.from(receiptsByAppt.values()).reduce((sum, rows) => sum + rows.length, 0) || Array.from(paymentsByAppt.values()).reduce((sum, rows) => sum + rows.length, 0);
  const photoTotal = Array.from(photosByAppt.values()).reduce((sum, rows) => sum + rows.length, 0);
  const agreementTotal = agreementByAppt.size;

  const mapToRecord = <T,>(m: Map<string, T[]>) => {
    const o: Record<string, T[]> = {};
    m.forEach((v, k) => {
      o[k] = v;
    });
    return o;
  };
  const agreementRecord: Record<string, boolean> = {};
  const agreementHrefByAppt: Record<string, string> = {};
  agreementByAppt.forEach((row, k) => {
    agreementRecord[k] = true;
    agreementHrefByAppt[k] = `/dashboard/agreements/${encodeURIComponent(`signed_agreements:${row.id}`)}`;
  });

  const snapshotByAppt: Record<string, CustomerApptSnapshotView> = {};
  if (adminDb && appointments.length > 0) {
    const snaps = await Promise.all(
      appointments.map(async (a) => {
        const snap = await loadCustomerSnapshotForAppointment(adminDb, a.id);
        return snap ? ([a.id, snap] as const) : null;
      }),
    );
    for (const row of snaps) {
      if (row) snapshotByAppt[row[0]] = row[1];
    }
  }

  const { resolveGoogleReviewUrl } = await import('@/lib/site-defaults');
  let googleReviewUrl = '';
  if (adminDb) {
    const ss = await adminDb.from('site_settings').select('value').eq('key', 'google_review_url').maybeSingle();
    const raw = ss.data?.value;
    if (typeof raw === 'string' && raw.startsWith('http')) googleReviewUrl = raw.trim();
    else if (raw && typeof raw === 'object') {
      const o = raw as { url?: unknown; review_url?: unknown };
      const u = o.review_url ?? o.url;
      if (typeof u === 'string' && u.startsWith('http')) googleReviewUrl = u.trim();
    }
    if (!googleReviewUrl) {
      const gb = await adminDb.from('site_settings').select('value').eq('key', 'google_business').maybeSingle();
      const rv = gb.data?.value;
      if (rv && typeof rv === 'object' && 'review_url' in (rv as object)) {
        const u = (rv as { review_url?: unknown }).review_url;
        if (typeof u === 'string') googleReviewUrl = u.trim();
      }
    }
  }

  return (
    <DashboardShell title='Your dashboard' subtitle='Garage, appointments, receipts, agreements, and live updates.' role='customer'>
      <CustomerDashboardClient
        googleReviewUrl={resolveGoogleReviewUrl(googleReviewUrl)}
        liveJob={liveJob ?? null}
        liveEvents={liveEvents}
        upcoming={upcoming}
        inFlight={inFlight}
        pending={pending}
        history={history}
        eventsByAppt={mapToRecord(eventsByAppt)}
        paymentsByAppt={mapToRecord(paymentsByAppt)}
        receiptsByAppt={mapToRecord(receiptsByAppt)}
        agreementByAppt={agreementRecord}
        agreementHrefByAppt={agreementHrefByAppt}
        photosByAppt={mapToRecord(photosByAppt)}
        vehicleTotal={vehicleTotal}
        receiptTotal={receiptTotal}
        photoTotal={photoTotal}
        agreementTotal={agreementTotal}
        appointmentCount={appointments.length}
        snapshotByAppt={snapshotByAppt}
        loyaltyStampsCount={loyaltyStampsCount}
        activeCardDesign={activeCardDesign}
        membership={customerMembership}
        accountCreditBalanceCents={accountCreditBalanceCents}
        activeDeals={activeDeals}
      />
    </DashboardShell>
  );
}

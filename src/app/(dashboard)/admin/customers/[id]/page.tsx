import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { listCustomerVehicles } from '@/lib/crm-vehicles-db';
import { CustomerEditForm } from '@/components/admin/customer-edit-form';
import { CustomerVehiclesManager } from '@/components/admin/customer-vehicles-manager';
import { SyncCapturedVehiclesButton } from '@/components/admin/sync-captured-vehicles-button';
import { addCustomerNoteAction } from '@/app/(dashboard)/admin/customer-note-actions';
import { unarchiveCustomerAction, addManualLoyaltyStampAction, deleteLoyaltyStampAction } from '@/app/(dashboard)/admin/customer-actions';
import { LoyaltyCard3D } from '@/components/dashboard/loyalty-card-3d';
import { CustomerCreditsManager } from '@/components/admin/customer-credits-manager';
import { calculateLoyaltyStatus } from '@/lib/loyalty-ledger';
import { CustomerProfileTabs } from '@/components/admin/customer-profile-tabs';
import { CustomerTimelineFeed } from '@/components/admin/customer-timeline-feed';
import { loadCustomerTimeline } from '@/lib/customer-timeline';
import { 
  Mail, 
  Phone, 
  MapPin, 
  User, 
  Award, 
  Car, 
  CreditCard, 
  ShieldAlert,
  PhoneCall,
  ArrowLeft,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

function chicago(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = tryCreateAdminSupabase();
  if (!admin) notFound();

  const { data: customer } = await admin.from('customers').select('*').eq('id', id).maybeSingle();
  if (!customer) notFound();

  const c = customer as Record<string, unknown>;

  const custEmailRaw = String(c.email ?? '').trim().toLowerCase();
  const custPhoneRaw = String(c.phone ?? '').replace(/\D/g, '');

  const [apptsRes, apptsByEmailRes, apptsByPhoneRes] = await Promise.all([
    admin
      .from('appointments')
      .select(
        'id, status, payment_status, scheduled_start, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, created_at, assigned_technician_id, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, guest_name, guest_email, guest_phone',
      )
      .eq('customer_id', id)
      .order('scheduled_start', { ascending: false })
      .limit(80),
    custEmailRaw
      ? admin
          .from('appointments')
          .select('id, status, payment_status, scheduled_start, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, created_at, assigned_technician_id, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, guest_name, guest_email, guest_phone')
          .eq('guest_email', custEmailRaw)
          .limit(80)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    custPhoneRaw
      ? admin
          .from('appointments')
          .select('id, status, payment_status, scheduled_start, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, created_at, assigned_technician_id, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, guest_name, guest_email, guest_phone')
          .eq('guest_phone', custPhoneRaw)
          .limit(80)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const apptMap = new Map<string, Record<string, unknown>>();
  for (const row of [...(apptsRes.data ?? []), ...(apptsByEmailRes.data ?? []), ...(apptsByPhoneRes.data ?? [])]) {
    const r = row as Record<string, unknown>;
    if (r.id) apptMap.set(String(r.id), r);
  }
  const apptRows = [...apptMap.values()] as unknown as {
    id: string;
    status: string;
    payment_status?: string | null;
    scheduled_start: string;
    service_slug: string;
    vehicle_class: string;
    base_price_cents: number | null;
    deposit_amount_cents?: number | null;
    created_at?: string;
    assigned_technician_id?: string | null;
    vehicle_description?: string | null;
    booking_vehicles?: unknown;
    service_address?: string | null;
    service_city?: string | null;
    service_state?: string | null;
    service_zip?: string | null;
    guest_name?: string | null;
  }[];

  const apptIds = apptRows.map((a) => a.id);
  const techIds = [...new Set(apptRows.map((a) => a.assigned_technician_id).filter(Boolean))] as string[];
  const { data: techProfiles } =
    techIds.length > 0
      ? await admin.from('profiles').select('id, full_name').in('id', techIds)
      : { data: [] as { id: string; full_name: string | null }[] };
  const techName = new Map((techProfiles ?? []).map((p) => [p.id, p.full_name ?? p.id.slice(0, 8)]));

  const paymentsQ =
    apptIds.length > 0
      ? await admin.from('payments').select('amount_cents, status, created_at, appointment_id, stripe_checkout_session_id, stripe_payment_intent_id').in('appointment_id', apptIds)
      : { data: [] as { amount_cents: number; status: string; created_at: string; appointment_id: string }[] };

  const paymentRows = (paymentsQ.data ?? []) as { amount_cents: number; status: string; created_at: string; appointment_id: string; stripe_checkout_session_id?: string | null; stripe_payment_intent_id?: string | null }[];
  const paySucceeded = paymentRows.filter((p) => p.status === 'succeeded');
  const paymentsTotalCents = paySucceeded.reduce((s, p) => s + (typeof p.amount_cents === 'number' ? p.amount_cents : 0), 0);

  const now = new Date();
  const upcoming = apptRows.filter((a) => new Date(a.scheduled_start) >= now);
  const past = apptRows.filter((a) => new Date(a.scheduled_start) < now);

  const completedPast = past.filter((a) => a.status === 'completed');
  const headlineSpendCents = paymentsTotalCents;
  const pendingBookings = apptRows.filter((a) => !['completed', 'cancelled'].includes(a.status));
  const serviceSlugs = [...new Set(apptRows.filter((a) => a.status === 'completed').map((a) => a.service_slug).filter(Boolean))];

  let vehicles: { id: string; description: string; notes: string | null; created_at: string }[] = [];
  try {
    vehicles = await listCustomerVehicles(admin, id);
  } catch {
    vehicles = [];
  }
  const apptVehicles = apptRows
    .flatMap((a) => {
      if (Array.isArray(a.booking_vehicles)) {
        return a.booking_vehicles
          .map((v) => (v && typeof v === 'object' ? String((v as Record<string, unknown>).vehicle_description ?? '') : ''))
          .filter(Boolean);
      }
      return a.vehicle_description ? [a.vehicle_description] : [];
    })
    .filter(Boolean);

  const addr1 = typeof c.address_line1 === 'string' ? c.address_line1 : '';
  const addr2 = typeof c.address_line2 === 'string' ? c.address_line2 : '';
  const city = typeof c.city === 'string' ? c.city : '';
  const state = typeof c.state === 'string' ? c.state : '';
  const postal = typeof c.postal_code === 'string' ? c.postal_code : '';

  const { data: stampsData } = await admin
    .from('loyalty_stamps')
    .select('id, stamp_count, reason, created_at, appointment_id, voided, voided_at, voided_by, source, admin_id, technician_id')
    .eq('customer_id', id)
    .order('created_at', { ascending: false });

  const stamps = (stampsData ?? []) as Array<{ id: string; stamp_count: number; reason: string | null; note?: string | null; created_at: string; appointment_id?: string | null; voided?: boolean | null; voided_at?: string | null; voided_by?: string | null; source?: string | null; admin_id?: string | null; technician_id?: string | null }>;
  const loyaltyStatus = calculateLoyaltyStatus(stamps);
  const stampsTotal = loyaltyStatus.totalStamps;
  const currentPunchCardStamps = loyaltyStatus.progressStamps;
  const isRewardReady = loyaltyStatus.rewardReady;

  const { data: activeMembership } = await admin
    .from('customer_memberships')
    .select('*, membership_plans(*)')
    .eq('customer_id', id)
    .in('status', ['active', 'trialing', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const tier = ((activeMembership?.membership_plans as any)?.tier || 'default').toLowerCase();
  const membershipName = (activeMembership?.membership_plans as any)?.name || 'Standard Client';

  const { data: activeCardDesign } = await admin
    .from('loyalty_card_designs')
    .select('*')
    .eq('tier', tier)
    .eq('active', true)
    .eq('archived', false)
    .maybeSingle();

  let finalCardDesign = activeCardDesign;
  if (!finalCardDesign && tier !== 'default') {
    const { data: defaultDesign } = await admin
      .from('loyalty_card_designs')
      .select('*')
      .eq('tier', 'default')
      .eq('active', true)
      .eq('archived', false)
      .maybeSingle();
    finalCardDesign = defaultDesign;
  }
  const { data: creditsData } = await admin
    .from('customer_credits')
    .select('*, profiles(full_name)')
    .eq('customer_id', id)
    .order('issued_at', { ascending: false });

  const { data: redemptionsData } = await admin
    .from('customer_credit_redemptions')
    .select('*, profiles(full_name), customer_credits!inner(customer_id), payments(appointment_id, fallback_booking_id)')
    .eq('customer_credits.customer_id', id)
    .order('redeemed_at', { ascending: false });

  const creditsList = (creditsData ?? []).map((c: any) => ({
    id: c.id,
    amount_cents: c.amount_cents,
    remaining_cents: c.remaining_cents,
    type: c.type,
    reason: c.reason,
    status: c.status,
    issued_at: c.issued_at,
    expires_at: c.expires_at,
    linked_work_order_id: c.linked_work_order_id,
    linked_payment_id: c.linked_payment_id,
    issued_by_name: c.profiles?.full_name || 'Staff',
  }));

  const redemptionsList = (redemptionsData ?? []).map((r: any) => ({
    id: r.id,
    credit_id: r.credit_id,
    payment_id: r.payment_id,
    amount_cents: r.amount_cents,
    redeemed_at: r.redeemed_at,
    redeemed_by_name: r.profiles?.full_name || 'Staff',
    appointment_id: r.payments?.appointment_id,
    fallback_booking_id: r.payments?.fallback_booking_id,
  }));

  const isArchived = Boolean(c.archived);

  const timelineBundle = await loadCustomerTimeline(admin, id, {
    email: String(c.email ?? ''),
    phone: String(c.phone ?? ''),
    full_name: String(c.full_name ?? ''),
  });

  const noteForm = (
    <form action={addCustomerNoteAction} className="space-y-3 rounded-2xl border border-white/5 bg-black/40 p-4">
      <input type="hidden" name="customerId" value={id} />
      <label className="block text-[9px] font-bold uppercase tracking-wider text-zinc-400">
        Add staff note to timeline
        <textarea
          name="body"
          rows={2}
          required
          placeholder="Special requests, VIP notes, follow-up context…"
          className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold/40"
        />
      </label>
      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-xl border border-gold/45 bg-gold/5 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-gold-soft hover:bg-gold/15 transition"
        >
          Save note
        </button>
      </div>
    </form>
  );

  return (
    <DashboardShell title={String(c.full_name ?? c.email ?? 'Customer')} subtitle="Customer CRM detail console" role="admin">
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link href="/admin/customers" className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-zinc-400 hover:text-white transition tracking-wider">
            <ArrowLeft className="h-4 w-4" /> Back to directory
          </Link>
        </div>

        {/* Top Status Alert if Archived */}
        {isArchived && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4.5 w-4.5 text-amber-400" />
              <span><strong>Archived Profile</strong>: This customer has been hidden from the main CRM directories.</span>
            </div>
            <form action={unarchiveCustomerAction} className="inline">
              <input type="hidden" name="id" value={id} />
              <button type="submit" className="rounded-xl border border-gold/45 bg-gold/10 px-4 py-2 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/20 transition">
                Restore to Directory
              </button>
            </form>
          </div>
        )}

        {/* Customer Header Info Panel */}
        <section className="rounded-3xl border border-gold/25 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 h-40 w-40 bg-gold/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              {/* Avatar Initial Badge */}
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/30 via-gold/10 to-black border border-gold/45 text-gold-soft font-black text-xl shadow-[0_0_15px_rgba(212,175,55,0.2)]">
                {String(c.full_name ?? c.email ?? 'GB').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl font-black text-white uppercase tracking-tight truncate">
                    {String(c.full_name ?? 'Unnamed Client')}
                  </h1>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                    tier === 'gold' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' :
                    tier === 'silver' ? 'bg-zinc-400/10 text-zinc-300 border border-zinc-500/20' :
                    tier === 'bronze' ? 'bg-orange-700/10 text-orange-400 border border-orange-700/30' :
                    'bg-white/5 text-zinc-400 border border-white/10'
                  }`}>
                    <Award className="h-3.5 w-3.5 text-gold-soft" /> {membershipName}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">ID: {String(c.id).slice(0, 8)}...</p>

                {/* Micro details */}
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-300">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gold-soft shrink-0" />
                    <span className="truncate max-w-[200px]">{String(c.email ?? '—')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gold-soft shrink-0" />
                    <span>{c.phone ? String(c.phone) : 'No phone'}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gold-soft shrink-0" />
                    <span className="truncate max-w-[200px]">
                      {[addr1, addr2, city, state].filter(Boolean).join(', ') || 'No address'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick action hooks & Lifetime value */}
            <div className="flex flex-col gap-3.5 items-end justify-between self-stretch">
              <div className="bg-black/50 border border-white/5 rounded-2xl p-4 w-full md:w-56 text-right">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">LTV (Lifetime Spend)</p>
                <p className="text-2xl font-black text-white mt-1 font-mono">${(headlineSpendCents / 100).toFixed(2)}</p>
                <div className="mt-2.5 flex items-center justify-between text-[10px] text-zinc-400 border-t border-white/5 pt-2 font-mono">
                  <span>Visits: <strong className="text-white">{completedPast.length}</strong></span>
                  <span>Active: <strong className="text-amber-300">{pendingBookings.length}</strong></span>
                </div>
              </div>

              {/* Call / Email action buttons (hooks) */}
              <div className="flex gap-2 w-full md:w-auto">
                {c.phone ? (
                  <a
                    href={`tel:${c.phone}`}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-900 border border-white/10 hover:border-gold/30 hover:bg-gold/5 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-300 transition duration-200"
                  >
                    <PhoneCall className="h-3.5 w-3.5 text-gold-soft" /> Call
                  </a>
                ) : null}
                {c.email ? (
                  <a
                    href={`mailto:${c.email}`}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-900 border border-white/10 hover:border-gold/30 hover:bg-gold/5 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-300 transition duration-200"
                  >
                    <Mail className="h-3.5 w-3.5 text-gold-soft" /> Email
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <CustomerTimelineFeed events={timelineBundle.events} noteForm={noteForm} />

        {/* Management tabs — timeline above is the primary customer story */}
        <CustomerProfileTabs
          tabs={[
            {
              id: 'vehicles',
              label: 'Vehicles & Services',
              icon: <Car className="h-3.5 w-3.5" />,
              content: (
                <div className="space-y-6">
                  {/* Vehicles Manager */}
                  <div className="bg-zinc-950/40 border border-white/5 rounded-3xl p-6 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                      <div>
                        <h2 className="text-xs font-black uppercase text-gold-soft tracking-wider">Client Garage</h2>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Manage vehicles and synchronizations on file.</p>
                      </div>
                      <SyncCapturedVehiclesButton customerId={id} />
                    </div>

                    <CustomerVehiclesManager customerId={id} vehicles={vehicles} />
                    
                    {apptVehicles.length > 0 && (
                      <div className="mt-6 border-t border-white/5 pt-4">
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Auto-Captured from appointments</p>
                        <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed font-mono">
                          {apptVehicles.slice(0, 8).join('  ·  ')}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Services Received summary */}
                  <div className="bg-zinc-950/40 border border-white/5 rounded-3xl p-6 backdrop-blur-md">
                    <h2 className="text-xs font-black uppercase text-gold-soft tracking-wider mb-2">Service Portfolio</h2>
                    <p className="text-[10px] text-zinc-500 mb-4">Unique services successfully rendered on client vehicles.</p>
                    
                    {serviceSlugs.length ? (
                      <div className="flex flex-wrap gap-2">
                        {serviceSlugs.map((slug) => (
                          <span key={slug} className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-gold-soft">
                            {slug.replace(/-/g, ' ')}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500 italic py-2">No services have been processed yet.</p>
                    )}
                  </div>
                </div>
              ),
            },
            {
              id: 'membership',
              label: 'Membership & Loyalty',
              icon: <Award className="h-3.5 w-3.5" />,
              content: (
                <div className="space-y-6">
                  {/* Punch Card Controls */}
                  <div className="bg-zinc-950/40 border border-white/5 rounded-3xl p-6 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-5">
                      <div>
                        <h2 className="text-xs font-black uppercase text-gold-soft tracking-wider">Loyalty Stamp Ledger</h2>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Award stamps, adjust balances, and check status.</p>
                      </div>
                      <span className="rounded-full bg-gold/10 px-2.5 py-0.5 text-[10px] font-black uppercase text-gold-soft border border-gold/25">
                        {stampsTotal} Stamps Awarded
                      </span>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                      <div className="space-y-4">
                        <p className="text-xs text-zinc-400">
                          The customer currently has <strong className="text-white">{currentPunchCardStamps} / 5 stamps</strong> on their active punch card.
                        </p>

                        {/* Punch Grid Visual */}
                        <div className="flex gap-2.5 pt-1">
                          {[1, 2, 3, 4, 5].map((i) => {
                            const isStamped = currentPunchCardStamps >= i;
                            return (
                              <div
                                key={i}
                                className={`flex h-11 w-11 items-center justify-center rounded-xl border text-sm font-black transition duration-200 ${
                                  isStamped
                                    ? 'border-gold bg-gold/15 text-gold-soft shadow-[0_0_10px_rgba(212,175,55,0.15)]'
                                    : 'border-white/10 bg-black/40 text-zinc-600'
                                }`}
                              >
                                {isStamped ? '★' : i}
                              </div>
                            );
                          })}
                          <div
                            className={`flex h-11 px-3.5 items-center justify-center rounded-xl border text-[10px] font-black tracking-wider transition duration-200 ${
                              isRewardReady
                                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 animate-pulse'
                                : 'border-white/10 bg-black/40 text-zinc-600'
                            }`}
                          >
                            REWARD
                          </div>
                        </div>

                        {/* Manual Stamp Add Form */}
                        <form action={addManualLoyaltyStampAction} className="space-y-3 rounded-2xl border border-white/5 bg-black/40 p-4.5 mt-4">
                          <input type="hidden" name="customerId" value={id} />
                          <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Record Manual Loyalty Stamps</p>
                          
                          <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
                            <label className="block text-[9px] uppercase font-bold text-zinc-500">
                              Stamp Count
                              <select name="stampCount" className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-2 py-2 text-xs text-white">
                                <option value="1">+1 Stamp</option>
                                <option value="2">+2 Stamps</option>
                                <option value="3">+3 Stamps</option>
                                <option value="4">+4 Stamps</option>
                                <option value="5">+5 Stamps</option>
                              </select>
                            </label>
                            <label className="block text-[9px] uppercase font-bold text-zinc-500">
                              Reason for Awarding
                              <input name="reason" placeholder="e.g. Promotion adjustment, review bonus..." className="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white focus:outline-none focus:border-gold/40" />
                            </label>
                          </div>

                          <button type="submit" className="w-full rounded-xl border border-gold/45 bg-gold/5 py-2.5 text-xs font-black uppercase tracking-wider text-gold-soft hover:bg-gold/15 transition">
                            Award Stamps to Profile
                          </button>
                        </form>
                      </div>

                      {/* Stamp Ledger History list */}
                      <div className="border-t lg:border-t-0 lg:border-l border-white/5 pt-5 lg:pt-0 lg:pl-6">
                        <h3 className="text-xs font-black uppercase text-zinc-400 mb-3 tracking-wider">Stamp Audit Logs</h3>
                        {stamps.length === 0 ? (
                          <p className="text-xs text-zinc-500 italic py-6 text-center border border-dashed border-white/5 rounded-2xl">
                            No loyalty stamps processed yet.
                          </p>
                        ) : (
                          <ul className="space-y-3 max-h-[300px] overflow-y-auto pr-1 text-xs">
                            {stamps.map((s) => {
                              const isVoided = Boolean(s.voided);
                              return (
                                <li key={s.id} className={`flex items-start justify-between gap-3 border-b border-white/5 pb-2.5 last:border-0 last:pb-0 ${isVoided ? 'opacity-50' : ''}`}>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className={`font-semibold ${isVoided ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                                        {s.reason || s.note || 'Loyalty stamp earned'}
                                      </p>
                                      {isVoided && (
                                        <span className="rounded bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase text-red-400">
                                          Voided
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-zinc-500 mt-1 font-mono">
                                      {chicago(s.created_at)}
                                      {s.appointment_id && ` · WO #${s.appointment_id.slice(0, 8)}`}
                                      {isVoided && s.voided_at && ` · Voided ${chicago(s.voided_at)}`}
                                    </p>
                                  </div>
                                  
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`rounded px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                                      isVoided ? 'bg-zinc-800 text-zinc-500 line-through' : 'bg-gold/10 text-gold-soft border border-gold/25'
                                    }`}>
                                      {isVoided ? '0' : `+${s.stamp_count ?? 1}`}
                                    </span>
                                    
                                    {!isVoided ? (
                                      <form action={deleteLoyaltyStampAction} method="POST" className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                        <input type="hidden" name="stampId" value={s.id} />
                                        <input type="hidden" name="customerId" value={id} />
                                        <input type="text" name="voidReason" placeholder="Reason..." required className="w-16 rounded-lg border border-zinc-700 bg-black px-1.5 py-1 text-[9px] text-white outline-none focus:border-red-500" />
                                        <button type="submit" className="text-[10px] font-black uppercase text-red-500/80 hover:text-red-400 transition border border-red-500/25 bg-red-500/5 px-2 py-1 rounded-lg">
                                          Void
                                        </button>
                                      </form>
                                    ) : (
                                      <span className="text-[9px] text-zinc-600 font-black uppercase font-mono">Voided</span>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 3D Loyalty card rendering preview */}
                  <div className="bg-zinc-950/40 border border-white/5 rounded-3xl p-6 backdrop-blur-md">
                    <h2 className="text-xs font-black uppercase text-gold-soft tracking-wider mb-4">Loyalty Program Card View</h2>
                    <div className="flex justify-center py-4 bg-black/40 border border-white/5 rounded-2xl">
                      <LoyaltyCard3D 
                        activeCardDesign={finalCardDesign} 
                        stampsCount={stampsTotal} 
                        customerEmail={custEmailRaw || 'VIP CLIENT'} 
                      />
                    </div>
                  </div>
                </div>
              ),
            },
            {
              id: 'credits',
              label: 'Store Credits',
              icon: <CreditCard className="h-3.5 w-3.5" />,
              content: (
                <div className="bg-zinc-950/40 border border-white/5 rounded-3xl p-6 backdrop-blur-md">
                  <h2 className="text-xs font-black uppercase text-gold-soft tracking-wider mb-2">Credits Ledger</h2>
                  <p className="text-[10px] text-zinc-500 mb-5">Issue and reconcile goodwill store credits.</p>
                  
                  <CustomerCreditsManager
                    customerId={id}
                    credits={creditsList}
                    redemptions={redemptionsList}
                  />
                </div>
              ),
            },
            {
              id: 'edit',
              label: 'Profile Settings',
              icon: <User className="h-3.5 w-3.5" />,
              content: (
                <div className="bg-zinc-950/40 border border-white/5 rounded-3xl p-6 backdrop-blur-md">
                  <h2 className="text-xs font-black uppercase text-gold-soft tracking-wider mb-4">Update Profile Credentials</h2>
                  <CustomerEditForm
                    customerId={id}
                    initial={{
                      full_name: String(c.full_name ?? ''),
                      email: String(c.email ?? ''),
                      phone: String(c.phone ?? ''),
                      address_line1: addr1,
                      address_line2: addr2,
                      city,
                      state,
                      postal_code: postal,
                      sms_consent: c.sms_consent === true,
                      sms_status: String(c.sms_status ?? (c.sms_consent === true ? 'opted_in' : 'opted_out')),
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </div>
    </DashboardShell>
  );
}

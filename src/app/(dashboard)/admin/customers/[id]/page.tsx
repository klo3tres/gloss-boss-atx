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
import { workOrderPath } from '@/lib/work-order-links';
import { LoyaltyCard3D } from '@/components/dashboard/loyalty-card-3d';
import { CustomerCreditsManager } from '@/components/admin/customer-credits-manager';
import { calculateLoyaltyStatus } from '@/lib/loyalty-ledger';
import { Mail, Phone, MapPin, User, Award, DollarSign, Calendar } from 'lucide-react';

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

  const [apptsRes, notesRes, apptsByEmailRes, apptsByPhoneRes] = await Promise.all([
    admin
      .from('appointments')
      .select(
        'id, status, payment_status, scheduled_start, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, created_at, assigned_technician_id, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, guest_name, guest_email, guest_phone',
      )
      .eq('customer_id', id)
      .order('scheduled_start', { ascending: false })
      .limit(80),
    admin.from('customer_notes').select('id, body, created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(40),
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

  const signedQ =
    apptIds.length > 0
      ? await admin.from('signed_agreements').select('id, signed_at, appointment_id').in('appointment_id', apptIds)
      : { data: [] as { id: string; signed_at: string | null; appointment_id: string }[] };

  const [intakeByCustomer, intakeByAppt] = await Promise.all([
    admin.from('intake_submissions').select('id, created_at, appointment_id').eq('customer_id', id).order('created_at', { ascending: false }).limit(40),
    apptIds.length
      ? admin.from('intake_submissions').select('id, created_at, appointment_id').in('appointment_id', apptIds).order('created_at', { ascending: false }).limit(40)
      : Promise.resolve({ data: [] as { id: string; created_at: string; appointment_id: string | null }[] }),
  ]);

  const intakeMap = new Map<string, { id: string; created_at: string; appointment_id: string | null }>();
  for (const row of [...(intakeByCustomer.data ?? []), ...(intakeByAppt.data ?? [])]) {
    intakeMap.set(String(row.id), row as { id: string; created_at: string; appointment_id: string | null });
  }
  const intakeRows = [...intakeMap.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const completedPast = past.filter((a) => a.status === 'completed');
  const completedJobValueCents = completedPast.reduce(
    (s, a) => s + (typeof a.base_price_cents === 'number' ? a.base_price_cents : 0),
    0,
  );
  const paidViaStripeCents = paymentsTotalCents;
  const headlineSpendCents = paidViaStripeCents;
  const pendingBookings = apptRows.filter((a) => !['completed', 'cancelled'].includes(a.status));
  const serviceSlugs = [...new Set(apptRows.filter((a) => a.status === 'completed').map((a) => a.service_slug).filter(Boolean))];

  let vehicles: { id: string; description: string; notes: string | null; created_at: string }[] = [];
  try {
    vehicles = await listCustomerVehicles(admin, id);
  } catch {
    vehicles = [];
  }
  const notes = (notesRes.data ?? []) as { id: string; body: string; created_at: string }[];
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

  const custEmail = String(c.email ?? '')
    .trim()
    .toLowerCase();

  const [fieldNotesRes, fallbackRes] = await Promise.all([
    apptIds.length
      ? admin
          .from('tech_job_notes')
          .select(
            'id, appointment_id, before_notes, after_notes, damage_notes, internal_notes, upsell_suggestions, customer_visible, created_at',
          )
          .in('appointment_id', apptIds)
          .order('created_at', { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    custEmail
      ? admin
          .from('booking_fallbacks')
          .select('id, status, guest_email, created_at, promotion_error, converted_appointment_id')
          .eq('guest_email', custEmail)
          .order('created_at', { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const fieldNoteRows = (fieldNotesRes.data ?? []) as Record<string, unknown>[];
  const fallbackRows = (fallbackRes.data ?? []) as Record<string, unknown>[];
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
  const membershipName = (activeMembership?.membership_plans as any)?.name || 'Standard Client (No Tier)';

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

  return (
    <DashboardShell title={String(c.full_name ?? c.email ?? 'Customer')} subtitle='Customer CRM detail' role='admin'>
      <Link href='/admin/customers' className='mb-4 inline-block text-xs font-bold uppercase text-gold-soft underline'>
        ← Customers
      </Link>

      {isArchived ? (
        <div className='mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>
          <span className='font-bold uppercase'>Archived customer</span>
          <form action={unarchiveCustomerAction} className='inline'>
            <input type='hidden' name='id' value={id} />
            <button type='submit' className='rounded-lg border border-gold/40 px-3 py-1 text-xs font-bold uppercase text-gold-soft'>
              Restore to directory
            </button>
          </form>
        </div>
      ) : null}

      {/* Premium CRM Profile Header & Loyalty Card Preview */}
      <div className='grid gap-6 lg:grid-cols-2 mb-6'>
        {/* CRM Customer Profile Details */}
        <section className='rounded-3xl border border-gold/25 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-6 shadow-xl relative overflow-hidden'>
          <div className="absolute top-0 right-0 h-32 w-32 bg-gold/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className='flex items-start gap-4'>
            {/* Avatar Badge */}
            <div className='flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/30 via-gold/10 to-black border border-gold/45 text-gold-soft font-black text-xl shadow-[0_0_15px_rgba(212,175,55,0.2)]'>
              {String(c.full_name ?? c.email ?? 'GB').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            
            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <h1 className='text-xl font-black text-white uppercase tracking-tight truncate'>
                  {String(c.full_name ?? 'Unnamed Client')}
                </h1>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                  tier === 'gold' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' :
                  tier === 'silver' ? 'bg-zinc-400/10 text-zinc-300 border border-zinc-500/20' :
                  tier === 'bronze' ? 'bg-orange-700/10 text-orange-400 border border-orange-700/30' :
                  'bg-white/5 text-zinc-400 border border-white/10'
                }`}>
                  <Award className="h-3 w-3" /> {membershipName}
                </span>
              </div>
              <p className='text-xs text-zinc-500 font-mono mt-0.5'>ID: {String(c.id).slice(0, 8)}...</p>
            </div>
          </div>

          <div className='mt-6 grid gap-4 sm:grid-cols-2 border-t border-white/5 pt-5 text-sm'>
            <div className='space-y-3.5'>
              <div className='flex items-center gap-2.5 text-zinc-300'>
                <Mail className='h-4 w-4 text-gold-soft shrink-0' />
                <span className='truncate font-medium'>{String(c.email ?? '—')}</span>
              </div>
              <div className='flex items-center gap-2.5 text-zinc-300'>
                <Phone className='h-4 w-4 text-gold-soft shrink-0' />
                <span>{c.phone ? String(c.phone) : 'No phone recorded'}</span>
              </div>
              <div className='flex items-start gap-2.5 text-zinc-300'>
                <MapPin className='h-4 w-4 text-gold-soft shrink-0 mt-0.5' />
                <span className='leading-tight'>
                  {[addr1, addr2].filter(Boolean).join(', ') ? (
                    <>
                      {[addr1, addr2].filter(Boolean).join(', ')}
                      <br />
                      <span className='text-zinc-500 text-xs'>{[city, state, postal].filter(Boolean).join(', ')}</span>
                    </>
                  ) : 'No address on file'}
                </span>
              </div>
            </div>

            <div className='bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col justify-between'>
              <div>
                <p className='text-[9px] font-black uppercase tracking-widest text-zinc-500'>Lifetime Spend</p>
                <p className='text-2xl font-black text-white mt-1'>
                  ${(headlineSpendCents / 100).toFixed(2)}
                </p>
              </div>
              <div className='mt-3 flex items-center justify-between text-[10px] text-zinc-400 border-t border-white/5 pt-2'>
                <span>Visits: <strong className='text-white'>{completedPast.length}</strong></span>
                <span>Active Bookings: <strong className='text-amber-200'>{pendingBookings.length}</strong></span>
              </div>
            </div>
          </div>
        </section>

        {/* Loyalty Card interactive-like preview */}
        <section className='rounded-3xl border border-gold/25 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-6 shadow-xl flex flex-col justify-between'>
          <div>
            <div className='flex justify-between items-center mb-3.5'>
              <div>
                <h3 className='text-xs font-black uppercase text-gold-soft tracking-wider'>Loyalty Stamp Progress</h3>
                <p className='text-[10px] text-zinc-500 mt-0.5'>Active digital membership card (Flippable)</p>
              </div>
              <span className='rounded-full bg-gold/10 px-2.5 py-0.5 text-[10px] font-black uppercase text-gold-soft border border-gold/25'>
                {stampsTotal} Total Stamps
              </span>
            </div>
            
            <LoyaltyCard3D 
              activeCardDesign={finalCardDesign} 
              stampsCount={stampsTotal} 
              customerEmail={custEmailRaw || 'VIP MEMBER'} 
            />
          </div>

          <div className='mt-4 flex items-center justify-between text-xs text-zinc-400 bg-black/30 border border-white/5 p-2.5 rounded-xl'>
            <p>
              Current Card Punch: <strong className='text-white'>{currentPunchCardStamps} / 5 stamps</strong>
            </p>
            <p className='font-bold'>
              {isRewardReady ? 'Reward Ready' : 'Accumulating'}
            </p>
          </div>
        </section>
      </div>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <div className='flex items-center justify-between border-b border-white/10 pb-3 mb-4'>
          <h2 className='text-sm font-bold uppercase text-gold-soft'>Loyalty Program & Punch Card</h2>
          <span className='rounded-full bg-gold/10 px-2.5 py-0.5 text-[10px] font-black uppercase text-gold-soft border border-gold/25'>
            {stampsTotal} Total Stamps
          </span>
        </div>

        <div className='grid gap-6 md:grid-cols-2'>
          <div>
            <p className='text-xs text-zinc-400'>
              The customer currently has <strong className='text-white'>{currentPunchCardStamps} / 5 stamps</strong> on their active punch card.
            </p>

            {/* Micro visual representation of the active punch card */}
            <div className='mt-3 flex gap-2'>
              {[1, 2, 3, 4, 5].map((i) => {
                const isStamped = currentPunchCardStamps >= i;
                return (
                  <div
                    key={i}
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border text-xs font-black transition duration-200 ${
                      isStamped
                        ? 'border-gold bg-gold/15 text-gold-soft shadow-[0_0_10px_rgba(212,175,55,0.1)]'
                        : 'border-white/10 bg-black/40 text-zinc-600'
                    }`}
                  >
                    {isStamped ? '★' : i}
                  </div>
                );
              })}
              <div
                className={`flex h-10 px-3 items-center justify-center rounded-xl border text-[10px] font-black tracking-wider transition duration-200 ${
                  isRewardReady
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 animate-pulse'
                    : 'border-white/10 bg-black/40 text-zinc-600'
                }`}
              >
                REWARD
              </div>
            </div>

            {/* Quick manual stamp form */}
            <form action={addManualLoyaltyStampAction} className='mt-5 space-y-3 rounded-xl border border-white/10 bg-black/35 p-4'>
              <input type='hidden' name='customerId' value={id} />
              <p className='text-[10px] font-black uppercase tracking-wider text-zinc-400'>Record Manual Loyalty Stamp</p>
              
              <div className='grid gap-2 sm:grid-cols-[100px_1fr]'>
                <label className='block text-[9px] uppercase font-bold text-zinc-500'>
                  Count
                  <select name='stampCount' className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-xs text-white'>
                    <option value='1'>+1 Stamp</option>
                    <option value='2'>+2 Stamps</option>
                    <option value='3'>+3 Stamps</option>
                    <option value='4'>+4 Stamps</option>
                    <option value='5'>+5 Stamps</option>
                  </select>
                </label>
                <label className='block text-[9px] uppercase font-bold text-zinc-500'>
                  Reason
                  <input name='reason' placeholder='e.g., Promotion adjustment, referral bonus...' className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-xs text-white' />
                </label>
              </div>

              <button type='submit' className='w-full rounded border border-gold/45 bg-gold/5 py-1.5 text-xs font-black uppercase tracking-wider text-gold-soft hover:bg-gold/10 transition'>
                Award Loyalty Stamp
              </button>
            </form>
          </div>

          <div>
            <h3 className='text-xs font-bold uppercase text-zinc-400 mb-2.5'>Stamp Ledger</h3>
            {stamps.length === 0 ? (
              <p className='text-xs text-zinc-500 italic py-4 border border-dashed border-white/5 rounded-xl text-center'>
                No stamps have been recorded yet.
              </p>
            ) : (
              <ul className='space-y-3.5 max-h-[260px] overflow-y-auto pr-1 text-xs'>
                {stamps.map((s) => {
                  const isVoided = Boolean(s.voided);
                  return (
                    <li key={s.id} className={`flex items-start justify-between gap-3 border-b border-white/5 pb-2.5 last:border-b-0 ${isVoided ? 'opacity-55' : ''}`}>
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
                          {s.source && (
                            <span className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[8px] font-mono text-zinc-400 uppercase">
                              {s.source.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        <p className='text-[10px] text-zinc-500 mt-1 font-mono'>
                          {chicago(s.created_at)}
                          {s.appointment_id && ` · Appt ${s.appointment_id.slice(0, 8)}`}
                          {isVoided && s.voided_at && ` · Voided ${chicago(s.voided_at)}`}
                        </p>
                      </div>
                      <div className='flex items-center gap-2 shrink-0'>
                        <span className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${isVoided ? 'bg-zinc-800 text-zinc-500 line-through' : 'bg-gold/10 text-gold-soft border border-gold/25'}`}>
                          {isVoided ? '0' : `+${s.stamp_count ?? 1}`}
                        </span>
                        {!isVoided ? (
                          <form action={deleteLoyaltyStampAction} method="POST" className="flex items-center gap-1">
                            <input type="hidden" name="stampId" value={s.id} />
                            <input type="hidden" name="customerId" value={id} />
                            <input type="text" name="voidReason" placeholder="Reason..." required className="w-16 rounded border border-zinc-700 bg-black px-1 py-0.5 text-[9px] text-white outline-none" />
                            <button type="submit" className="text-[10px] font-black uppercase text-red-500/80 hover:text-red-400 transition-colors border border-red-500/25 bg-red-500/5 px-1 rounded">
                              Void
                            </button>
                          </form>
                        ) : (
                          <span className="text-[9px] text-zinc-600 font-bold uppercase">Inactive</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
          <h2 className="text-sm font-bold uppercase text-gold-soft">Customer Credits Ledger</h2>
        </div>
        <CustomerCreditsManager
          customerId={id}
          credits={creditsList}
          redemptions={redemptionsList}
        />
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-gold-soft'>Edit customer</h2>
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
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-gold-soft'>Vehicles on file</h2>
        <CustomerVehiclesManager customerId={id} vehicles={vehicles} />
        <SyncCapturedVehiclesButton customerId={id} />
        {apptVehicles.length > 0 ? (
          <p className='mt-4 text-xs text-zinc-500'>Appointment captures: {apptVehicles.slice(0, 8).join(' · ')}</p>
        ) : null}
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-gold-soft'>Services received</h2>
        <p className='mt-2 text-sm text-zinc-300'>{serviceSlugs.length ? serviceSlugs.join(' · ') : 'No completed services yet.'}</p>
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <div className='flex items-center justify-between gap-3'>
          <h2 className='text-sm font-bold uppercase text-gold-soft'>Work orders</h2>
          <Link href='/admin/work-orders' className='text-xs font-bold uppercase text-gold-soft underline'>Open board</Link>
        </div>
        <ul className='mt-3 space-y-2 text-sm'>
          {apptRows.length === 0 ? <li className='text-zinc-500'>No work orders yet.</li> : null}
          {apptRows.map((a) => (
            <li key={`wo-${a.id}`} className='rounded border border-white/10 px-3 py-2'>
              <Link href={workOrderPath(a.id, { shell: 'admin' })} className='font-semibold text-gold-soft underline'>
                {a.service_slug}
              </Link>
              <span className='ml-2 text-xs text-zinc-500'>{a.status}</span>
              {a.payment_status ? <span className='ml-2 text-xs text-emerald-300'>{a.payment_status}</span> : null}
              <p className='mt-1 text-xs text-zinc-500'>
                {[a.service_address, a.service_city, a.service_state, a.service_zip].filter(Boolean).join(', ') || 'No service address saved'}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-gold-soft'>Upcoming appointments</h2>
        <ul className='mt-3 space-y-2 text-sm'>
          {upcoming.length === 0 ? <li className='text-zinc-500'>None scheduled.</li> : null}
          {upcoming.map((a) => (
            <li key={a.id} className='rounded border border-white/10 px-3 py-2'>
              {a.service_slug} · {chicago(a.scheduled_start)} · {a.status}
              {a.assigned_technician_id ? (
                <span className='ml-2 text-xs text-gold-soft'>Tech: {techName.get(a.assigned_technician_id) ?? a.assigned_technician_id.slice(0, 8)}</span>
              ) : (
                <span className='ml-2 text-xs text-zinc-600'>Unassigned</span>
              )}
              {typeof a.deposit_amount_cents === 'number' ? (
                <span className='ml-2 text-xs text-zinc-500'>Deposit ${(a.deposit_amount_cents / 100).toFixed(2)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-gold-soft'>Past appointments</h2>
        <ul className='mt-3 space-y-2 text-sm'>
          {past.length === 0 ? (
            <li className='rounded-lg border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-zinc-500'>
              No past appointments yet
            </li>
          ) : null}
          {past.map((a) => (
            <li key={a.id} className='rounded border border-white/10 px-3 py-2'>
              {a.service_slug} · {chicago(a.scheduled_start)} · {a.status}
              {a.assigned_technician_id ? (
                <span className='ml-2 text-xs text-gold-soft'>Tech: {techName.get(a.assigned_technician_id) ?? a.assigned_technician_id.slice(0, 8)}</span>
              ) : null}
              {typeof a.base_price_cents === 'number' ? (
                <span className='ml-2 text-xs text-emerald-300/90'>${(a.base_price_cents / 100).toFixed(0)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-gold-soft'>Payments</h2>
        <ul className='mt-3 space-y-2 text-sm'>
          {paymentRows.length === 0 ? (
            <li className='rounded-lg border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-zinc-500'>
              No payments yet
            </li>
          ) : null}
          {paymentRows.map((p, i) => (
            <li key={`${p.appointment_id}-${p.created_at}-${i}`} className='rounded border border-white/10 px-3 py-2'>
              <span className='text-white'>${(p.amount_cents / 100).toFixed(2)}</span>
              <span className='ml-2 text-xs text-zinc-500'>{p.status}</span>
              <span className='ml-2 text-xs text-zinc-600'>{chicago(p.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-gold-soft'>Signed agreements</h2>
        <ul className='mt-3 space-y-2 text-sm'>
          {(signedQ.data ?? []).length === 0 ? (
            <li className='rounded-lg border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-zinc-500'>
              No signed agreements yet
            </li>
          ) : null}
          {(signedQ.data ?? []).map((s) => (
            <li key={s.id} className='rounded border border-white/10 px-3 py-2'>
              Appt {String(s.appointment_id).slice(0, 8)}… · Signed {chicago(s.signed_at)}
            </li>
          ))}
        </ul>
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-gold-soft'>Intake submissions</h2>
        <ul className='mt-3 space-y-2 text-sm'>
          {intakeRows.length === 0 ? (
            <li className='rounded-lg border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-zinc-500'>
              No intake submissions yet
            </li>
          ) : null}
          {intakeRows.map((r) => (
            <li key={r.id} className='rounded border border-white/10 px-3 py-2'>
              {chicago(r.created_at)}
              {r.appointment_id ? (
                <span className='ml-2 text-xs text-zinc-500'>Appt {String(r.appointment_id).slice(0, 8)}…</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-gold-soft'>Field job notes</h2>
        <p className='mt-1 text-xs text-zinc-500'>Latest technician notes tied to appointments (internal lines are staff-only).</p>
        <ul className='mt-3 space-y-2 text-sm'>
          {fieldNoteRows.length === 0 ? (
            <li className='text-zinc-500'>No field notes yet.</li>
          ) : null}
          {fieldNoteRows.map((r) => {
            const vis = Boolean(r.customer_visible);
            const bits: string[] = [];
            if (r.before_notes) bits.push(`Before: ${String(r.before_notes)}`);
            if (r.after_notes) bits.push(`After: ${String(r.after_notes)}`);
            if (r.damage_notes) bits.push(`Damage: ${String(r.damage_notes)}`);
            if (r.upsell_suggestions) bits.push(`Upsell: ${String(r.upsell_suggestions)}`);
            if (r.internal_notes) bits.push(`Internal: ${String(r.internal_notes)}`);
            const body = (vis ? bits : bits.filter((b) => !b.startsWith('Internal:'))).join('\n');
            return (
              <li key={String(r.id)} className='rounded border border-white/10 px-3 py-2 whitespace-pre-wrap text-zinc-300'>
                <span className='text-xs text-zinc-500'>
                  {chicago(String(r.created_at ?? ''))} · Appt {String(r.appointment_id).slice(0, 8)}…
                </span>
                <p className='mt-1 text-xs'>{body || '—'}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className='mt-6 rounded-2xl border border-amber-500/25 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-amber-200'>Fallback / failed booking attempts</h2>
        <p className='mt-1 text-xs text-zinc-500'>Rows when checkout could not create a live appointment — not counted as spend.</p>
        <ul className='mt-3 space-y-2 text-sm'>
          {fallbackRows.length === 0 ? (
            <li className='text-zinc-500'>No fallback rows for this email.</li>
          ) : null}
          {fallbackRows.map((r) => (
            <li key={String(r.id)} className='rounded border border-white/10 px-3 py-2 text-xs text-zinc-300'>
              <span className='font-mono text-[10px] text-zinc-500'>{String(r.status)}</span> ·{' '}
              {chicago(String(r.created_at ?? ''))}
              {r.promotion_error ? <p className='mt-1 text-rose-200/90'>{String(r.promotion_error)}</p> : null}
              {r.converted_appointment_id ? (
                <p className='mt-1 text-emerald-300/90'>Converted to appointment {String(r.converted_appointment_id).slice(0, 8)}…</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-gold-soft'>Internal notes</h2>
        <form action={addCustomerNoteAction} className='mt-3 space-y-2 rounded-lg border border-white/10 bg-black/30 p-3'>
          <input type='hidden' name='customerId' value={id} />
          <label className='block text-[10px] font-bold uppercase tracking-wider text-zinc-500'>
            Add note
            <textarea
              name='body'
              rows={3}
              required
              placeholder='Staff-only note…'
              className='mt-1 w-full rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-600'
            />
          </label>
          <button
            type='submit'
            className='rounded border border-gold/40 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-gold-soft'
          >
            Save note
          </button>
        </form>
        <ul className='mt-4 space-y-2 text-sm'>
          {notes.length === 0 ? (
            <li className='rounded-lg border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-zinc-500'>
              No notes yet — add one above.
            </li>
          ) : null}
          {notes.map((n) => (
            <li key={n.id} className='rounded border border-white/10 px-3 py-2 whitespace-pre-wrap text-zinc-300'>
              <span className='text-xs text-zinc-500'>{chicago(n.created_at)}</span>
              <p className='mt-1'>{n.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </DashboardShell>
  );
}

import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { assignAppointmentTechnicianAction } from '../dispatch-job-actions';
import { archiveBookingFallbackAction, deleteBookingFallbackAction } from '../booking-fallback-actions';
import { archiveAppointmentWorkOrderAction, clearStaleActiveTestRecordsAction, deleteAppointmentWorkOrderAction } from './work-order-actions';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v);
}

function money(v: unknown) {
  return typeof v === 'number' ? `$${(v / 100).toFixed(2)}` : '—';
}

function chicago(v: unknown) {
  if (!v) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(str(v)));
}

function address(r: Row) {
  return [r.service_address, r.service_city, r.service_state, r.service_zip].map(str).filter(Boolean).join(', ');
}

function vehicles(r: Row) {
  const bookingVehicles = r.booking_vehicles;
  if (Array.isArray(bookingVehicles) && bookingVehicles.length > 0) return `${bookingVehicles.length} vehicle(s)`;
  return str(r.vehicle_description) || str(r.vehicle_class) || 'Vehicle pending';
}

function vehicleLines(r: Row) {
  const bookingVehicles = r.booking_vehicles;
  if (Array.isArray(bookingVehicles) && bookingVehicles.length > 0) {
    return bookingVehicles.map((v, i) => {
      const row = v && typeof v === 'object' ? (v as Row) : {};
      return {
        label: str(row.vehicle_description || row.description) || `Vehicle ${i + 1}`,
        service: str(row.service_slug) || str(r.service_slug),
        color: str(row.vehicle_color || row.color) || 'Color not provided',
        priceCents: typeof row.price_cents === 'number' ? row.price_cents : null,
        status: str(row.status) || str(r.status),
      };
    });
  }
  return [{ label: str(r.vehicle_description) || str(r.vehicle_class) || 'Vehicle pending', service: str(r.service_slug), color: 'Color not provided', priceCents: typeof r.base_price_cents === 'number' ? r.base_price_cents : null, status: str(r.status) }];
}

function mapsHref(addr: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
}

function statusBucket(r: Row) {
  const status = str(r.status);
  const payment = str(r.payment_status);
  if (status === 'in_progress') return 'Active';
  if (status === 'completed') return 'Completed';
  if (status.includes('fallback') || str(r.kind) === 'fallback') return 'Fallback / test';
  if (payment.includes('paid') || status === 'deposit_paid' || status === 'confirmed' || status === 'assigned') return 'Paid bookings';
  return 'Unpaid bookings';
}

async function assignTechWorkOrderAction(formData: FormData) {
  'use server';
  await assignAppointmentTechnicianAction(formData);
}

async function archiveFallbackWorkOrderAction(formData: FormData) {
  'use server';
  await archiveBookingFallbackAction(formData);
}

async function deleteFallbackWorkOrderAction(formData: FormData) {
  'use server';
  await deleteBookingFallbackAction(formData);
}

async function archiveAppointmentWorkOrderFormAction(formData: FormData) {
  'use server';
  await archiveAppointmentWorkOrderAction(formData);
}

async function deleteAppointmentWorkOrderFormAction(formData: FormData) {
  'use server';
  await deleteAppointmentWorkOrderAction(formData);
}

async function clearStaleActiveTestRecordsFormAction(formData: FormData) {
  'use server';
  await clearStaleActiveTestRecordsAction(formData);
}

export default async function AdminWorkOrdersPage() {
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return (
      <DashboardShell title='Work orders' subtitle='Paid, unpaid, active, completed, and fallback jobs.' role='admin'>
        <p className='text-sm text-amber-200'>Service role unavailable.</p>
      </DashboardShell>
    );
  }

  const [appointmentsRes, fallbacksRes, techRes, agreementsRes, intakeRes, paymentsRes] = await Promise.all([
    admin
      .from('appointments')
      .select('id, access_token, customer_id, status, payment_status, scheduled_start, guest_name, guest_email, guest_phone, service_slug, vehicle_class, vehicle_description, booking_vehicles, booking_pricing_breakdown, promo_code, comp_reason, service_address, service_city, service_state, service_zip, base_price_cents, deposit_amount_cents, balance_due_cents, assigned_technician_id, stripe_checkout_session_id, archived, archived_at, created_at')
      .order('scheduled_start', { ascending: false })
      .limit(180),
    admin
      .from('booking_fallbacks')
      .select('id, status, payment_status, scheduled_start, guest_name, guest_email, guest_phone, service_slug, vehicle_description, booking_vehicles, booking_pricing_breakdown, promo_code, comp_reason, service_address, service_city, service_state, service_zip, base_price_cents, deposit_amount_cents, balance_due_cents, stripe_checkout_session_id, created_at, archived_at')
      .order('created_at', { ascending: false })
      .limit(80),
    admin.from('profiles').select('id, full_name, email, active').eq('role', 'technician').order('full_name'),
    admin.from('signed_agreements').select('id, appointment_id, signed_at').order('signed_at', { ascending: false }).limit(250),
    admin.from('intake_submissions').select('id, appointment_id, created_at').order('created_at', { ascending: false }).limit(250),
    admin.from('payments').select('id, appointment_id, fallback_booking_id, stripe_checkout_session_id, amount_cents, status, metadata, created_at').order('created_at', { ascending: false }).limit(250),
  ]);

  const agreementByAppt = new Map<string, Row>(
    ((agreementsRes.data ?? []) as Row[]).filter((a) => a.appointment_id).map((a) => [str(a.appointment_id), { ...a, source: 'signed_agreements' }]),
  );
  for (const intake of (intakeRes.data ?? []) as Row[]) {
    const aid = str(intake.appointment_id);
    if (aid && !agreementByAppt.has(aid)) agreementByAppt.set(aid, { ...intake, signed_at: intake.created_at, source: 'intake_submissions' });
  }
  const paymentByAppt = new Map<string, Row>();
  const paymentByFallback = new Map<string, Row>();
  const paymentBySession = new Map<string, Row>();
  for (const payment of (paymentsRes.data ?? []) as Row[]) {
    const aid = str(payment.appointment_id);
    const fid = str(payment.fallback_booking_id);
    const sid = str(payment.stripe_checkout_session_id);
    if (aid && !paymentByAppt.has(aid)) paymentByAppt.set(aid, payment);
    if (fid && !paymentByFallback.has(fid)) paymentByFallback.set(fid, payment);
    if (sid && !paymentBySession.has(sid)) paymentBySession.set(sid, payment);
  }
  const technicians = ((techRes.data ?? []) as Row[]).filter((t) => t.active !== false);
  const appts = ((appointmentsRes.data ?? []) as Row[]).filter((r) => r.archived !== true && !r.archived_at);
  const fallbacks: Row[] = ((fallbacksRes.data ?? []) as Row[])
    .filter((r) => !['archived', 'deleted', 'expired'].includes(str(r.status)) && !r.archived_at)
    .map((r) => ({ ...r, kind: 'fallback' }));
  const rows: Row[] = [...appts, ...fallbacks].sort((a, b) => new Date(str(b.scheduled_start || b.created_at)).getTime() - new Date(str(a.scheduled_start || a.created_at)).getTime());
  const buckets = ['Paid bookings', 'Unpaid bookings', 'Active', 'Completed', 'Fallback / test'];

  return (
    <DashboardShell title='Work orders' subtitle='Operational job board connected to payments, dispatch, and customers.' role='admin'>
      <div className='mb-4 flex flex-wrap gap-2 text-xs'>
        <Link href='/admin/payments' className='rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-bold uppercase text-emerald-200'>
          Payments / Receipts
        </Link>
        <Link href='/admin/dispatch' className='rounded-lg border border-gold/40 px-3 py-2 font-bold uppercase text-gold-soft'>
          Dispatch
        </Link>
        <Link href='/admin/customers' className='rounded-lg border border-white/15 px-3 py-2 font-bold uppercase text-zinc-300'>
          Customers
        </Link>
        <form action={clearStaleActiveTestRecordsFormAction} className='flex flex-wrap items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-2 py-1'>
          <input name='confirm' placeholder='CLEAR' className='w-20 rounded border border-red-500/30 bg-black px-2 py-1 text-[10px] text-red-100 placeholder:text-red-200/50' />
          <button className='rounded border border-red-500/30 px-3 py-1 text-[10px] font-bold uppercase text-red-200'>
            Clear stale active tests
          </button>
        </form>
      </div>
      {appointmentsRes.error ? <p className='mb-3 text-sm text-amber-200'>Appointments: {appointmentsRes.error.message}</p> : null}
      {fallbacksRes.error ? <p className='mb-3 text-sm text-amber-200'>Fallbacks: {fallbacksRes.error.message}</p> : null}
      <div className='grid gap-4 xl:grid-cols-2'>
        {buckets.map((bucket) => {
          const bucketRows = rows.filter((r) => statusBucket(r) === bucket);
          return (
            <section key={bucket} className='rounded-2xl border border-gold/20 bg-zinc-950/90 p-4 shadow-[0_0_24px_rgba(212,166,77,0.08)]'>
              <div className='flex items-center justify-between gap-3'>
                <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>{bucket}</h2>
                <span className='rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-zinc-300'>{bucketRows.length}</span>
              </div>
              <div className='mt-4 space-y-3'>
                {bucketRows.length === 0 ? <p className='rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-zinc-500'>No work orders in this bucket.</p> : null}
                {bucketRows.map((r) => {
                  const isFallback = str(r.kind) === 'fallback';
                  const agreement = agreementByAppt.get(str(r.id));
                  const payment =
                    (isFallback ? paymentByFallback.get(str(r.id)) : paymentByAppt.get(str(r.id))) ??
                    paymentBySession.get(str(r.stripe_checkout_session_id));
                  const paymentMeta = payment?.metadata && typeof payment.metadata === 'object' ? (payment.metadata as Row) : {};
                  const fullAddress = address(r) || str(paymentMeta.service_address);
                  const paymentHref = payment?.id
                    ? `/admin/payments/${str(payment.id)}`
                    : str(r.stripe_checkout_session_id)
                      ? `/admin/payments?session=${encodeURIComponent(str(r.stripe_checkout_session_id))}`
                      : '/admin/payments';
                  const agreementCaptureParams = new URLSearchParams();
                  if (!isFallback) agreementCaptureParams.set('appointment_id', str(r.id));
                  if (isFallback) agreementCaptureParams.set('fallback_booking_id', str(r.id));
                  if (str(r.access_token)) agreementCaptureParams.set('token', str(r.access_token));
                  if (str(r.customer_id)) agreementCaptureParams.set('customer_id', str(r.customer_id));
                  if (str(payment?.id)) agreementCaptureParams.set('payment_id', str(payment?.id));
                  if (str(r.stripe_checkout_session_id)) agreementCaptureParams.set('session_id', str(r.stripe_checkout_session_id));
                  if (str(r.guest_email)) agreementCaptureParams.set('email', str(r.guest_email));
                  if (str(r.guest_phone)) agreementCaptureParams.set('phone', str(r.guest_phone));
                  return (
                    <article key={`${isFallback ? 'fb' : 'appt'}-${str(r.id)}`} className='rounded-xl border border-white/10 bg-black/35 p-4 text-sm'>
                      <div className='flex flex-wrap items-start justify-between gap-3'>
                        <div>
                          <p className='font-semibold text-white'>{str(r.guest_name) || 'Customer'} · {str(r.service_slug).replace(/-/g, ' ') || 'Service'}</p>
                          <p className='text-xs text-zinc-500'>{chicago(r.scheduled_start || r.created_at)} · {str(r.status) || 'pending'} · {str(r.payment_status) || 'payment pending'}</p>
                        </div>
                        <p className='rounded-full border border-gold/25 px-2 py-1 text-[10px] font-bold uppercase text-gold-soft'>{money(r.deposit_amount_cents)} deposit / {money(r.base_price_cents)} total</p>
                      </div>
                      <div className='mt-3 grid gap-2 text-xs text-zinc-300 sm:grid-cols-2'>
                        <p>{str(r.guest_email)}<br />{str(r.guest_phone)}</p>
                        <p>{vehicles(r)}<br />{fullAddress || 'No service address on file — contact customer.'}</p>
                        <p>Tech: {str(technicians.find((t) => str(t.id) === str(r.assigned_technician_id))?.full_name) || 'Unassigned'}</p>
                        <p>Agreement: {agreement ? `Signed ${chicago(agreement.signed_at)}` : 'Missing'}</p>
                      </div>
                      {r.booking_pricing_breakdown && typeof r.booking_pricing_breakdown === 'object' ? (
                        <div className='mt-3 grid gap-2 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-zinc-300 sm:grid-cols-2'>
                          {(() => {
                            const b = r.booking_pricing_breakdown as Row;
                            return (
                              <>
                                <p>Base total: {money(b.baseTotalCents ?? r.base_price_cents)}</p>
                                <p>Final total: {money(b.finalTotalCents ?? r.base_price_cents)}</p>
                                <p>Promo / offer: {str(r.promo_code || b.offerLabel) || (b.offerDiscountCents ? `-${money(b.offerDiscountCents)}` : '—')}</p>
                                <p>Multi-car discount: {money(b.multiCarDiscountCents)}</p>
                                <p>Online booking discount: {money(b.onlineDiscountCents ?? b.sitewideDiscountCents)}</p>
                                <p>Deposit paid: {money(r.deposit_amount_cents)}</p>
                                <p>Remaining balance: {money(r.balance_due_cents)}</p>
                                {r.comp_reason ? <p className='sm:col-span-2 text-amber-200'>{str(r.comp_reason)}</p> : null}
                              </>
                            );
                          })()}
                        </div>
                      ) : null}
                      <div className='mt-3 grid gap-2 sm:grid-cols-2'>
                        {vehicleLines(r).map((v, i) => (
                          <div key={`${v.label}-${i}`} className='rounded-xl border border-white/10 bg-black/30 p-3 text-xs'>
                            <p className='font-bold text-white'>Vehicle {i + 1}: {v.label}</p>
                            <p className='text-gold-soft'>{v.service.replace(/-/g, ' ') || 'Service pending'}</p>
                            <p className='text-zinc-500'>
                              {v.color} · {v.priceCents != null ? `$${(v.priceCents / 100).toFixed(2)}` : 'Price pending'} · {v.status.replace(/_/g, ' ')}
                            </p>
                            <p className='mt-1 text-zinc-600'>Timer/photos/notes tracked under this work order.</p>
                          </div>
                        ))}
                      </div>
                      <div className='mt-4 flex flex-wrap gap-2'>
                        {!isFallback ? (
                          <form action={assignTechWorkOrderAction} className='flex gap-2'>
                            <input type='hidden' name='appointmentId' value={str(r.id)} />
                            <select name='technicianId' className='rounded border border-white/10 bg-black px-2 py-1 text-xs text-white'>
                              <option value=''>Assign tech</option>
                              {technicians.map((t) => (
                                <option key={str(t.id)} value={str(t.id)}>{str(t.full_name) || str(t.email)}</option>
                              ))}
                            </select>
                            <button className='rounded bg-gold px-3 py-1 text-[10px] font-black uppercase text-black'>Assign</button>
                          </form>
                        ) : null}
                        {!isFallback && str(r.customer_id) ? <Link href={`/admin/customers/${str(r.customer_id)}`} className='rounded border border-white/15 px-3 py-1 text-[10px] font-bold uppercase text-zinc-300'>Customer</Link> : null}
                        {fullAddress ? (
                          <a href={mapsHref(fullAddress)} target='_blank' rel='noreferrer' className='rounded border border-white/15 px-3 py-1 text-[10px] font-bold uppercase text-zinc-300'>Directions</a>
                        ) : (
                          <button disabled className='rounded border border-white/10 px-3 py-1 text-[10px] font-bold uppercase text-zinc-600'>No Directions</button>
                        )}
                        {(str(r.stripe_checkout_session_id) || payment) ? <Link href={paymentHref} className='rounded border border-emerald-500/30 px-3 py-1 text-[10px] font-bold uppercase text-emerald-200'>Payment</Link> : null}
                        {agreement ? <Link href={`/admin/agreements/${encodeURIComponent(`${str(agreement.source ?? 'signed_agreements')}:${str(agreement.id)}`)}`} className='rounded border border-white/15 px-3 py-1 text-[10px] font-bold uppercase text-zinc-300'>View Agreement</Link> : <Link href={`/agreement?${agreementCaptureParams.toString()}`} className='rounded border border-amber-500/30 px-3 py-1 text-[10px] font-bold uppercase text-amber-200'>Capture Agreement</Link>}
                        {isFallback ? (
                          <>
                            <form action={archiveFallbackWorkOrderAction}><input type='hidden' name='id' value={str(r.id)} /><button className='rounded border border-amber-500/30 px-3 py-1 text-[10px] font-bold uppercase text-amber-200'>Archive</button></form>
                            <form action={deleteFallbackWorkOrderAction} className='flex gap-1'><input type='hidden' name='id' value={str(r.id)} /><input name='confirm' placeholder='DELETE' className='w-20 rounded border border-red-500/30 bg-black px-2 py-1 text-[10px]' /><button className='rounded border border-red-500/30 px-3 py-1 text-[10px] font-bold uppercase text-red-200'>Delete</button></form>
                          </>
                        ) : (
                          <>
                            <form action={archiveAppointmentWorkOrderFormAction} className='flex gap-1'><input type='hidden' name='id' value={str(r.id)} /><input name='confirm' placeholder='ARCHIVE' className='w-24 rounded border border-amber-500/30 bg-black px-2 py-1 text-[10px]' /><button className='rounded border border-amber-500/30 px-3 py-1 text-[10px] font-bold uppercase text-amber-200'>Archive</button></form>
                            <form action={deleteAppointmentWorkOrderFormAction} className='flex gap-1'><input type='hidden' name='id' value={str(r.id)} /><input name='confirm' placeholder='DELETE' className='w-20 rounded border border-red-500/30 bg-black px-2 py-1 text-[10px]' /><button className='rounded border border-red-500/30 px-3 py-1 text-[10px] font-bold uppercase text-red-200'>Delete</button></form>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </DashboardShell>
  );
}

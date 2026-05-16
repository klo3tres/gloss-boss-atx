import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { assignAppointmentTechnicianAction } from '../dispatch-job-actions';
import { archiveBookingFallbackAction, deleteBookingFallbackAction } from '../booking-fallback-actions';
import { archiveAppointmentWorkOrderAction } from './work-order-actions';

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

export default async function AdminWorkOrdersPage() {
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return (
      <DashboardShell title='Work orders' subtitle='Paid, unpaid, active, completed, and fallback jobs.' role='admin'>
        <p className='text-sm text-amber-200'>Service role unavailable.</p>
      </DashboardShell>
    );
  }

  const [appointmentsRes, fallbacksRes, techRes, agreementsRes] = await Promise.all([
    admin
      .from('appointments')
      .select('id, customer_id, status, payment_status, scheduled_start, guest_name, guest_email, guest_phone, service_slug, vehicle_class, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, base_price_cents, deposit_amount_cents, assigned_technician_id, stripe_checkout_session_id, archived, archived_at, created_at')
      .order('scheduled_start', { ascending: false })
      .limit(180),
    admin
      .from('booking_fallbacks')
      .select('id, status, payment_status, scheduled_start, guest_name, guest_email, guest_phone, service_slug, vehicle_description, service_address, service_city, service_state, service_zip, base_price_cents, deposit_amount_cents, stripe_checkout_session_id, created_at, archived_at')
      .order('created_at', { ascending: false })
      .limit(80),
    admin.from('profiles').select('id, full_name, email, active').eq('role', 'technician').order('full_name'),
    admin.from('signed_agreements').select('id, appointment_id, signed_at').order('signed_at', { ascending: false }).limit(250),
  ]);

  const agreementByAppt = new Map(
    ((agreementsRes.data ?? []) as Row[]).filter((a) => a.appointment_id).map((a) => [str(a.appointment_id), a]),
  );
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
                        <p>{vehicles(r)}<br />{address(r) || 'No service address saved'}</p>
                        <p>Tech: {str(technicians.find((t) => str(t.id) === str(r.assigned_technician_id))?.full_name) || 'Unassigned'}</p>
                        <p>Agreement: {agreement ? `Signed ${chicago(agreement.signed_at)}` : 'Missing'}</p>
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
                        {str(r.stripe_checkout_session_id) ? <Link href='/admin/payments' className='rounded border border-emerald-500/30 px-3 py-1 text-[10px] font-bold uppercase text-emerald-200'>Payment</Link> : null}
                        {agreement ? <Link href='/admin/agreements' className='rounded border border-white/15 px-3 py-1 text-[10px] font-bold uppercase text-zinc-300'>Agreement</Link> : null}
                        {isFallback ? (
                          <>
                            <form action={archiveFallbackWorkOrderAction}><input type='hidden' name='id' value={str(r.id)} /><button className='rounded border border-amber-500/30 px-3 py-1 text-[10px] font-bold uppercase text-amber-200'>Archive</button></form>
                            <form action={deleteFallbackWorkOrderAction} className='flex gap-1'><input type='hidden' name='id' value={str(r.id)} /><input name='confirm' placeholder='DELETE' className='w-20 rounded border border-red-500/30 bg-black px-2 py-1 text-[10px]' /><button className='rounded border border-red-500/30 px-3 py-1 text-[10px] font-bold uppercase text-red-200'>Delete</button></form>
                          </>
                        ) : (
                          <form action={archiveAppointmentWorkOrderFormAction} className='flex gap-1'><input type='hidden' name='id' value={str(r.id)} /><input name='confirm' placeholder='ARCHIVE' className='w-24 rounded border border-amber-500/30 bg-black px-2 py-1 text-[10px]' /><button className='rounded border border-amber-500/30 px-3 py-1 text-[10px] font-bold uppercase text-amber-200'>Archive</button></form>
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

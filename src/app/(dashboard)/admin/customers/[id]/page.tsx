import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { CustomerEditForm } from '@/components/admin/customer-edit-form';
import { CustomerVehiclesManager } from '@/components/admin/customer-vehicles-manager';
import { SyncCapturedVehiclesButton } from '@/components/admin/sync-captured-vehicles-button';
import { addCustomerNoteAction } from '@/app/(dashboard)/admin/customer-note-actions';
import { unarchiveCustomerAction } from '@/app/(dashboard)/admin/customer-actions';
import { syncVehiclesForCustomerRecord } from '@/lib/crm-vehicle-sync';
import { workOrderPath } from '@/lib/work-order-links';

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

  await syncVehiclesForCustomerRecord(admin, id);

  const c = customer as Record<string, unknown>;

  const custEmailRaw = String(c.email ?? '').trim().toLowerCase();
  const custPhoneRaw = String(c.phone ?? '').replace(/\D/g, '');

  const [apptsRes, vehiclesRes, notesRes, apptsByEmailRes, apptsByPhoneRes] = await Promise.all([
    admin
      .from('appointments')
      .select(
        'id, status, payment_status, scheduled_start, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, created_at, assigned_technician_id, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, guest_name, guest_email, guest_phone',
      )
      .eq('customer_id', id)
      .order('scheduled_start', { ascending: false })
      .limit(80),
    admin.from('vehicles').select('id, description, notes, created_at').eq('customer_id', id).order('created_at', { ascending: false }),
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

  const vehicles = (vehiclesRes.data ?? []) as { id: string; description: string; notes: string | null; created_at: string }[];
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

      <div className='grid gap-4 lg:grid-cols-2'>
        <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
          <h2 className='text-sm font-bold uppercase text-gold-soft'>Contact</h2>
          <p className='mt-2 text-white'>{String(c.email ?? '')}</p>
          {c.phone ? <p className='text-zinc-400'>{String(c.phone)}</p> : null}
          <div className='mt-3 text-sm text-zinc-400'>
            {[addr1, addr2].filter(Boolean).join(', ')}
            <br />
            {[city, state, postal].filter(Boolean).join(', ')}
          </div>
          {apptRows.some((a) => a.service_address) ? (
            <p className='mt-3 text-xs text-zinc-500'>
              Latest service address:{' '}
              {[apptRows.find((a) => a.service_address)?.service_address, apptRows.find((a) => a.service_address)?.service_city, apptRows.find((a) => a.service_address)?.service_state, apptRows.find((a) => a.service_address)?.service_zip]
                .filter(Boolean)
                .join(', ')}
            </p>
          ) : null}
          <p className='mt-2 text-xs text-zinc-500'>Created {c.created_at ? new Date(String(c.created_at)).toLocaleString() : '—'}</p>
        </section>
        <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
          <h2 className='text-sm font-bold uppercase text-gold-soft'>Lifetime stats</h2>
          <p className='mt-2 text-3xl font-black text-white'>${(headlineSpendCents / 100).toFixed(0)}</p>
          <p className='text-xs text-zinc-500'>Paid through Stripe (succeeded) on linked appointments — failed or unpaid checkouts are excluded.</p>
          {completedJobValueCents > 0 ? (
            <p className='mt-2 text-xs text-zinc-600'>
              Completed job booked subtotal (reference, may include non-captured balances): ${(completedJobValueCents / 100).toFixed(0)}
            </p>
          ) : null}
          <p className='mt-3 text-sm text-zinc-300'>
            Pending / in-flight bookings: <span className='font-semibold text-amber-200'>{pendingBookings.length}</span>
          </p>
          <p className='mt-2 text-sm text-zinc-400'>
            Stripe (succeeded payments): <span className='font-semibold text-emerald-300'>${(paymentsTotalCents / 100).toFixed(2)}</span>
          </p>
          {paySucceeded.length === 0 ? (
            <p className='mt-1 text-xs text-zinc-600'>No succeeded Stripe payments linked to these appointments yet.</p>
          ) : null}
        </section>
      </div>

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

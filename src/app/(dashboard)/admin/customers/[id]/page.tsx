import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { CustomerEditForm } from '@/components/admin/customer-edit-form';
import { addCustomerNoteAction } from '@/app/(dashboard)/admin/customer-note-actions';

export const dynamic = 'force-dynamic';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = tryCreateAdminSupabase();
  if (!admin) notFound();

  const { data: customer } = await admin.from('customers').select('*').eq('id', id).maybeSingle();
  if (!customer) notFound();

  const c = customer as Record<string, unknown>;

  const [apptsRes, vehiclesRes, notesRes] = await Promise.all([
    admin
      .from('appointments')
      .select(
        'id, status, scheduled_start, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, created_at, assigned_technician_id, vehicle_description, guest_name',
      )
      .eq('customer_id', id)
      .order('scheduled_start', { ascending: false })
      .limit(80),
    admin.from('vehicles').select('id, description, notes, created_at').eq('customer_id', id).order('created_at', { ascending: false }),
    admin.from('customer_notes').select('id, body, created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(40),
  ]);

  const apptRows = (apptsRes.data ?? []) as {
    id: string;
    status: string;
    scheduled_start: string;
    service_slug: string;
    vehicle_class: string;
    base_price_cents: number | null;
    deposit_amount_cents?: number | null;
    created_at?: string;
    assigned_technician_id?: string | null;
    vehicle_description?: string | null;
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
      ? await admin.from('payments').select('amount_cents, status, created_at, appointment_id').in('appointment_id', apptIds)
      : { data: [] as { amount_cents: number; status: string; created_at: string; appointment_id: string }[] };

  const paymentRows = (paymentsQ.data ?? []) as { amount_cents: number; status: string; created_at: string; appointment_id: string }[];
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
  const lifetimeDisplayCents = paidViaStripeCents > 0 ? paidViaStripeCents : completedJobValueCents;
  const serviceSlugs = [...new Set(apptRows.map((a) => a.service_slug).filter(Boolean))];

  const vehicles = (vehiclesRes.data ?? []) as { id: string; description: string; notes: string | null; created_at: string }[];
  const notes = (notesRes.data ?? []) as { id: string; body: string; created_at: string }[];

  const addr1 = typeof c.address_line1 === 'string' ? c.address_line1 : '';
  const addr2 = typeof c.address_line2 === 'string' ? c.address_line2 : '';
  const city = typeof c.city === 'string' ? c.city : '';
  const state = typeof c.state === 'string' ? c.state : '';
  const postal = typeof c.postal_code === 'string' ? c.postal_code : '';

  return (
    <DashboardShell title={String(c.full_name ?? c.email ?? 'Customer')} subtitle='Customer CRM detail' role='admin'>
      <Link href='/admin/customers' className='mb-4 inline-block text-xs font-bold uppercase text-gold-soft underline'>
        ← Customers
      </Link>

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
          <p className='mt-2 text-xs text-zinc-500'>Created {c.created_at ? new Date(String(c.created_at)).toLocaleString() : '—'}</p>
        </section>
        <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
          <h2 className='text-sm font-bold uppercase text-gold-soft'>Lifetime stats</h2>
          <p className='mt-2 text-3xl font-black text-white'>${(lifetimeDisplayCents / 100).toFixed(0)}</p>
          <p className='text-xs text-zinc-500'>
            {paidViaStripeCents > 0
              ? 'Paid total (Stripe succeeded on linked appointments).'
              : 'Completed job booked value (no Stripe payouts on file — deposit-only or off-platform).'}
          </p>
          {paidViaStripeCents > 0 && completedJobValueCents > 0 ? (
            <p className='mt-1 text-xs text-zinc-600'>Completed jobs (booked value): ${(completedJobValueCents / 100).toFixed(0)} reference</p>
          ) : null}
          <p className='mt-2 text-xs text-zinc-500'>
            Pending / non-completed: {apptRows.filter((a) => a.status !== 'completed' && a.status !== 'cancelled').length} open row(s) ·{' '}
            {past.filter((a) => a.status !== 'completed').length} past row(s) not counted as completed revenue
          </p>
          <p className='mt-2 text-sm text-zinc-400'>
            Stripe (succeeded payments): <span className='font-semibold text-emerald-300'>${(paymentsTotalCents / 100).toFixed(2)}</span>
          </p>
          {paySucceeded.length === 0 ? <p className='mt-1 text-xs text-zinc-600'>No succeeded payments linked to these appointments yet.</p> : null}
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
        <ul className='mt-3 space-y-2 text-sm'>
          {vehicles.length === 0 ? (
            <li className='rounded-lg border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-zinc-500'>
              No vehicles on file
            </li>
          ) : null}
          {vehicles.map((v) => (
            <li key={v.id} className='rounded border border-white/10 px-3 py-2'>
              <p className='text-white'>{v.description}</p>
              {v.notes ? <p className='text-xs text-zinc-500'>{v.notes}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-gold-soft'>Services received</h2>
        <p className='mt-2 text-sm text-zinc-300'>{serviceSlugs.length ? serviceSlugs.join(' · ') : '—'}</p>
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-gold-soft'>Upcoming appointments</h2>
        <ul className='mt-3 space-y-2 text-sm'>
          {upcoming.length === 0 ? <li className='text-zinc-500'>None scheduled.</li> : null}
          {upcoming.map((a) => (
            <li key={a.id} className='rounded border border-white/10 px-3 py-2'>
              {a.service_slug} · {new Date(a.scheduled_start).toLocaleString()} · {a.status}
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
              {a.service_slug} · {new Date(a.scheduled_start).toLocaleString()} · {a.status}
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
              <span className='ml-2 text-xs text-zinc-600'>{new Date(p.created_at).toLocaleString()}</span>
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
              Appt {String(s.appointment_id).slice(0, 8)}… · Signed {s.signed_at ? new Date(s.signed_at).toLocaleString() : '—'}
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
              {new Date(r.created_at).toLocaleString()}
              {r.appointment_id ? (
                <span className='ml-2 text-xs text-zinc-500'>Appt {String(r.appointment_id).slice(0, 8)}…</span>
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
              <span className='text-xs text-zinc-500'>{new Date(n.created_at).toLocaleString()}</span>
              <p className='mt-1'>{n.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </DashboardShell>
  );
}

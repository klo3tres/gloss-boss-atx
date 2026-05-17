import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { PrintButton } from '@/components/ui/print-button';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v);
}

function chicago(v: unknown) {
  if (!v) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(str(v)));
}

function prettyJson(v: unknown) {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return String(v ?? '');
  }
}

export default async function AgreementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = tryCreateAdminSupabase();
  if (!admin) notFound();

  const decoded = decodeURIComponent(id);
  const [sourceRaw, rowIdRaw] = decoded.includes(':') ? decoded.split(':', 2) : ['signed_agreements', decoded];
  const source = sourceRaw === 'intake_submissions' || sourceRaw === 'job_agreements' ? sourceRaw : 'signed_agreements';
  const rowId = rowIdRaw?.trim();
  if (!rowId) notFound();

  const { data } = await admin.from(source).select('*').eq('id', rowId).maybeSingle();
  if (!data) notFound();
  const row = data as Row;
  const appointmentId = str(row.appointment_id);
  const customerId = str(row.customer_id);
  const [apptRes, customerRes] = await Promise.all([
    appointmentId ? admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle() : Promise.resolve({ data: null }),
    customerId ? admin.from('customers').select('*').eq('id', customerId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const appt = (apptRes.data ?? {}) as Row;
  const customer = (customerRes.data ?? {}) as Row;
  const snapshot = row.agreement_snapshot ?? row.form_data ?? row.payload ?? row;
  const vehicles = Array.isArray(row.vehicle_data)
    ? row.vehicle_data
    : Array.isArray(appt.booking_vehicles)
      ? appt.booking_vehicles
      : [];

  return (
    <DashboardShell title='Agreement detail' subtitle='Matched signed agreement or intake record for this work order.' role='admin'>
      <Link href='/admin/agreements' className='text-xs font-bold uppercase tracking-wider text-gold-soft underline'>← Agreements</Link>
      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <div className='grid gap-4 lg:grid-cols-2'>
          <div>
            <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Customer</p>
            <p className='mt-2 text-white'>{str(row.signer_legal_name || customer.full_name || appt.guest_name) || 'Customer'}</p>
            <p className='text-sm text-zinc-400'>{str(customer.email || appt.guest_email)}</p>
            <p className='text-sm text-zinc-400'>{str(customer.phone || appt.guest_phone)}</p>
          </div>
          <div>
            <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Signature</p>
            <p className='mt-2 text-white'>{source.replace(/_/g, ' ')}</p>
            <p className='text-sm text-zinc-400'>Signed/submitted {chicago(row.signed_at || row.created_at)}</p>
            <p className='text-sm text-zinc-400'>SMS consent: {String(row.sms_consent ?? (row.form_data as Row | undefined)?.sms_consent ?? 'not recorded')}</p>
            {row.witness_name ? <p className='text-sm text-zinc-400'>Witness: {str(row.witness_name)}</p> : null}
          </div>
        </div>
        <div className='mt-5 grid gap-3 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-300 lg:grid-cols-2'>
          <p><span className='text-zinc-500'>Appointment:</span> {appointmentId || '—'}</p>
          <p><span className='text-zinc-500'>Fallback:</span> {str(row.fallback_booking_id) || '—'}</p>
          <p><span className='text-zinc-500'>Address:</span> {str(row.service_address || appt.service_address) || '—'}</p>
          <p><span className='text-zinc-500'>Service:</span> {str(appt.service_slug).replace(/-/g, ' ') || '—'}</p>
        </div>
        <section className='mt-5 rounded-xl border border-white/10 bg-black/30 p-4'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Vehicle(s)</p>
          {vehicles.length ? (
            <ul className='mt-3 space-y-2 text-sm text-zinc-300'>
              {(vehicles as unknown[]).map((v, i) => {
                const vr = v && typeof v === 'object' ? (v as Row) : {};
                return <li key={i}>Vehicle {i + 1}: {str(vr.vehicle_description || vr.description) || 'Vehicle'} · {str(vr.vehicle_color || vr.color) || 'Color not provided'}</li>;
              })}
            </ul>
          ) : (
            <p className='mt-3 text-sm text-zinc-500'>No vehicle snapshot attached.</p>
          )}
        </section>
        <PrintButton className='mt-5 inline-block rounded-xl bg-gold px-4 py-3 text-xs font-black uppercase tracking-wider text-black'>Download PDF / Print</PrintButton>
        <section className='mt-5 rounded-xl border border-white/10 bg-black/30 p-4 print:border-zinc-300 print:bg-white'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Snapshot</p>
          <pre className='mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap text-xs text-zinc-300'>{prettyJson(snapshot)}</pre>
        </section>
      </section>
    </DashboardShell>
  );
}

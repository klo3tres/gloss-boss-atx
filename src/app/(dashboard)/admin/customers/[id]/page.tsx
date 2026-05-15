import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = tryCreateAdminSupabase();
  if (!admin) notFound();

  const { data: customer } = await admin.from('customers').select('*').eq('id', id).maybeSingle();
  if (!customer) notFound();

  const [appts, intake, agreements] = await Promise.all([
    admin.from('appointments').select('id, status, scheduled_start, service_slug, base_price_cents').eq('customer_id', id).order('scheduled_start', { ascending: false }).limit(20),
    admin.from('intake_submissions').select('id, created_at, form_data').limit(0),
    admin.from('signed_agreements').select('id, signed_at').limit(0),
  ]);

  const apptRows = appts.data ?? [];
  const totalSpent = apptRows.reduce((s, a) => s + (typeof a.base_price_cents === 'number' ? a.base_price_cents : 0), 0);

  return (
    <DashboardShell title={String(customer.full_name ?? customer.email)} subtitle='Customer CRM detail' role='admin'>
      <Link href='/admin/customers' className='mb-4 inline-block text-xs font-bold uppercase text-gold-soft underline'>
        ← Customers
      </Link>
      <div className='grid gap-4 lg:grid-cols-2'>
        <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
          <h2 className='text-sm font-bold uppercase text-gold-soft'>Contact</h2>
          <p className='mt-2 text-white'>{String(customer.email)}</p>
          {customer.phone ? <p className='text-zinc-400'>{String(customer.phone)}</p> : null}
          <p className='mt-2 text-xs text-zinc-500'>Since {customer.created_at ? new Date(String(customer.created_at)).toLocaleDateString() : '—'}</p>
        </section>
        <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
          <h2 className='text-sm font-bold uppercase text-gold-soft'>Lifetime value (bookings)</h2>
          <p className='mt-2 text-3xl font-black text-white'>${(totalSpent / 100).toFixed(0)}</p>
          <p className='text-xs text-zinc-500'>{apptRows.length} appointment(s) linked</p>
        </section>
      </div>
      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-gold-soft'>Appointments</h2>
        <ul className='mt-3 space-y-2 text-sm'>
          {apptRows.length === 0 ? <li className='text-zinc-500'>No linked appointments.</li> : null}
          {apptRows.map((a) => (
            <li key={String(a.id)} className='rounded border border-white/10 px-3 py-2'>
              {String(a.service_slug)} · {new Date(String(a.scheduled_start)).toLocaleString()} · {String(a.status)}
            </li>
          ))}
        </ul>
      </section>
    </DashboardShell>
  );
}

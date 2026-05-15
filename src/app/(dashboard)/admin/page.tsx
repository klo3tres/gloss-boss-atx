import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type ApptRow = {
  id: string;
  status: string;
  scheduled_start: string;
  guest_name: string | null;
  guest_email: string | null;
  service_slug: string;
  vehicle_class: string;
  base_price_cents: number;
  assigned_technician_id: string | null;
};

export default async function AdminDashboardPage() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();

  let appointments: ApptRow[] = [];
  if (supabase && session.user && isAdminLevel(session.profile?.role ?? null)) {
    const { data } = await supabase
      .from('appointments')
      .select('id, status, scheduled_start, guest_name, guest_email, service_slug, vehicle_class, base_price_cents, assigned_technician_id')
      .order('scheduled_start', { ascending: true })
      .limit(60);
    appointments = (data ?? []) as ApptRow[];
  }

  return (
    <DashboardShell
      title='Operations dashboard'
      subtitle='Bookings pipeline, assignments, and customer-facing status — wired to Supabase.'
      role='admin'
    >
      <div className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Upcoming & active</p>
        <p className='mt-1 text-sm text-zinc-400'>{appointments.length} record(s) loaded from database.</p>
        <div className='mt-4 overflow-x-auto'>
          <table className='w-full min-w-[720px] border-collapse text-left text-sm'>
            <thead>
              <tr className='border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500'>
                <th className='py-2 pr-3'>When</th>
                <th className='py-2 pr-3'>Customer</th>
                <th className='py-2 pr-3'>Service</th>
                <th className='py-2 pr-3'>Class</th>
                <th className='py-2 pr-3'>Price</th>
                <th className='py-2 pr-3'>Status</th>
                <th className='py-2'>Tech</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id} className='border-b border-white/5 text-zinc-200'>
                  <td className='py-2 pr-3 whitespace-nowrap'>{new Date(a.scheduled_start).toLocaleString()}</td>
                  <td className='py-2 pr-3'>
                    <span className='font-semibold text-white'>{a.guest_name ?? '—'}</span>
                    <br />
                    <span className='text-xs text-zinc-500'>{a.guest_email ?? ''}</span>
                  </td>
                  <td className='py-2 pr-3'>{a.service_slug}</td>
                  <td className='py-2 pr-3'>{a.vehicle_class}</td>
                  <td className='py-2 pr-3'>${(a.base_price_cents / 100).toFixed(0)}</td>
                  <td className='py-2 pr-3'>
                    <span className='rounded-full border border-gold/30 px-2 py-0.5 text-[10px] font-bold uppercase text-gold-soft'>{a.status}</span>
                  </td>
                  <td className='py-2 text-xs text-zinc-500'>{a.assigned_technician_id ? a.assigned_technician_id.slice(0, 8) + '…' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {appointments.length === 0 ? <p className='mt-4 text-sm text-zinc-500'>No appointments yet — bookings will appear here.</p> : null}
        </div>
      </div>
    </DashboardShell>
  );
}

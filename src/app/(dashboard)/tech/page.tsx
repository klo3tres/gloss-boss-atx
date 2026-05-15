import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { TechJobsClient } from './tech-jobs-client';
import { TechFieldTools } from './tech-field-tools';

export const dynamic = 'force-dynamic';

type Job = {
  id: string;
  status: string;
  scheduled_start: string;
  guest_name: string | null;
  service_slug: string;
  vehicle_class: string;
};

export default async function TechnicianDashboardPage() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();

  let jobs: Job[] = [];
  if (supabase && session.user) {
    const { data } = await supabase
      .from('appointments')
      .select('id, status, scheduled_start, guest_name, service_slug, vehicle_class, notes')
      .eq('assigned_technician_id', session.user.id)
      .in('status', ['assigned', 'confirmed', 'in_progress'])
      .order('scheduled_start', { ascending: true });
    jobs = (data ?? []) as Job[];
  }

  return (
    <DashboardShell
      title='Technician workspace'
      subtitle='Assigned jobs only — start timers, complete work, and capture photos from the field.'
      role='technician'
    >
      <div className='mb-6 grid gap-3 sm:grid-cols-2'>
        <div className='rounded-2xl border border-gold/20 bg-zinc-950 p-4'>
          <p className='text-xs font-bold uppercase tracking-wider text-gold-soft'>SOP & standards</p>
          <ul className='mt-2 space-y-2 text-sm text-zinc-300'>
            <li>
              <a href='/services' className='text-gold-soft underline underline-offset-2 hover:text-white'>
                Service definitions & pricing
              </a>
            </li>
            <li>
              <a href='/book' className='text-gold-soft underline underline-offset-2 hover:text-white'>
                Booking flow reference
              </a>
            </li>
          </ul>
        </div>
        <div className='rounded-2xl border border-gold/20 bg-zinc-950 p-4'>
          <p className='text-xs font-bold uppercase tracking-wider text-gold-soft'>Liability & agreements</p>
          <p className='mt-2 text-sm text-zinc-400'>
            Customers complete the liability acknowledgment from their booking link after checkout. Use the appointment email link when you need to walk them through signing on-site.
          </p>
        </div>
      </div>

      <TechFieldTools />

      <TechJobsClient jobs={jobs} />
    </DashboardShell>
  );
}

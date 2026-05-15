import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { TechJobsClient } from './tech-jobs-client';

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
      .select('id, status, scheduled_start, guest_name, service_slug, vehicle_class')
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
      <TechJobsClient jobs={jobs} />
    </DashboardShell>
  );
}

import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DispatchBoardClient, type DispatchJobRow } from '@/components/admin/dispatch-board-client';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

const SELECT =
  'id, guest_name, guest_phone, guest_email, vehicle_description, service_slug, scheduled_start, base_price_cents, assigned_technician_id, status, service_address, notes, job_started_at, job_completed_at';

export default async function AdminDispatchPage() {
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return (
      <DashboardShell title='Dispatch' subtitle='Assign jobs to technicians.' role='admin'>
        <p className='text-amber-200'>Service role unavailable — cannot load dispatch board.</p>
      </DashboardShell>
    );
  }

  const [jobsRes, techRes] = await Promise.all([
    admin
      .from('appointments')
      .select(SELECT)
      .neq('status', 'awaiting_payment')
      .order('scheduled_start', { ascending: true })
      .limit(250),
    admin.from('profiles').select('id, full_name, email, role').eq('role', 'technician').order('full_name', { ascending: true }),
  ]);

  const jobs = (jobsRes.data ?? []) as DispatchJobRow[];
  const technicians = (techRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[];

  return (
    <DashboardShell title='Dispatch board' subtitle='Unassigned → assigned → in progress → completed.' role='admin'>
      <div className='mb-4 flex flex-wrap gap-3 text-xs'>
        <Link href='/admin/super' className='font-bold uppercase text-gold-soft underline'>
          ← Command center
        </Link>
        <Link href='/admin/leads' className='font-bold uppercase text-zinc-400 underline'>
          Leads pipeline
        </Link>
      </div>
      {jobsRes.error ? (
        <p className='mb-4 text-sm text-amber-200'>Appointments: {jobsRes.error.message}</p>
      ) : null}
      {techRes.error ? <p className='mb-4 text-xs text-amber-200'>Technicians: {techRes.error.message}</p> : null}
      <DispatchBoardClient jobs={jobs} technicians={technicians} />
    </DashboardShell>
  );
}

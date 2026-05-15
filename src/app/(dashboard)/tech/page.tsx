import Link from 'next/link';
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
  guest_phone: string | null;
  guest_email: string | null;
  vehicle_description: string | null;
  service_slug: string;
  vehicle_class: string;
  base_price_cents: number | null;
  notes?: string | null;
};

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default async function TechnicianDashboardPage() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();

  let jobs: Job[] = [];
  if (supabase && session.user) {
    const selectCols =
      'id, status, scheduled_start, guest_name, guest_phone, guest_email, vehicle_description, service_slug, vehicle_class, base_price_cents, notes';
    const { data } = await supabase
      .from('appointments')
      .select(selectCols)
      .eq('assigned_technician_id', session.user.id)
      .in('status', ['assigned', 'confirmed', 'in_progress'])
      .order('scheduled_start', { ascending: true });
    jobs = (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      status: String(row.status),
      scheduled_start: String(row.scheduled_start),
      guest_name: row.guest_name != null ? String(row.guest_name) : null,
      guest_phone: row.guest_phone != null ? String(row.guest_phone) : null,
      guest_email: row.guest_email != null ? String(row.guest_email) : null,
      vehicle_description: row.vehicle_description != null ? String(row.vehicle_description) : null,
      service_slug: String(row.service_slug ?? ''),
      vehicle_class: String(row.vehicle_class ?? 'sedan'),
      base_price_cents: typeof row.base_price_cents === 'number' ? row.base_price_cents : null,
      notes: row.notes != null ? String(row.notes) : null,
    }));
  }

  const todayJobs = jobs.filter((j) => isToday(j.scheduled_start));

  return (
    <DashboardShell
      title='Technician workspace'
      subtitle='Assigned jobs — timers, photos, and field tools.'
      role='technician'
    >
      <div className='mb-6 grid gap-3 rounded-2xl border border-gold/20 bg-zinc-950/80 p-4 sm:grid-cols-2 lg:grid-cols-4'>
        <Link
          href='/book'
          className='rounded-xl border border-gold/35 bg-black/40 px-4 py-3 text-center text-xs font-black uppercase tracking-wider text-gold-soft hover:bg-gold/10'
        >
          Start new job (book)
        </Link>
        <Link
          href='/admin/leads'
          className='rounded-xl border border-white/15 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-zinc-200 hover:border-gold/40'
        >
          Open leads
        </Link>
        <Link
          href='/tech/resources'
          className='rounded-xl border border-gold/40 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-gold-soft hover:bg-gold/10'
        >
          SOPs & documents
        </Link>
        <div className='flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-center text-[11px] text-zinc-500'>
          Active jobs below — timers & photos per assignment
        </div>
      </div>

      {todayJobs.length > 0 ? (
        <section className='mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5'>
          <p className='text-xs font-bold uppercase tracking-wider text-emerald-300'>Today&apos;s schedule</p>
          <ul className='mt-3 space-y-2'>
            {todayJobs.map((j) => (
              <li key={j.id} className='flex flex-wrap justify-between gap-2 text-sm text-zinc-200'>
                <span className='font-semibold'>{new Date(j.scheduled_start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                <span>{j.guest_name ?? 'Guest'} · {j.service_slug.replace(/-/g, ' ')}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className='mb-6 text-sm text-zinc-500'>No jobs scheduled for today.</p>
      )}

      <TechFieldTools />

      <h2 className='mb-3 text-sm font-bold uppercase tracking-wider text-gold-soft'>Active assignments</h2>
      <TechJobsClient jobs={jobs} />
    </DashboardShell>
  );
}

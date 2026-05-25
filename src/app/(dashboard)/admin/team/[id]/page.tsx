import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { displayChicago, displayMoney } from '@/lib/display-format';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { workOrderPath } from '@/lib/work-order-links';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function displayName(p: Row) {
  return str(p.display_name) || str(p.full_name) || str(p.email).split('@')[0] || 'Technician';
}

export default async function TechnicianProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) notFound();

  const { data: profile } = await admin.from('profiles').select('*').eq('id', id).maybeSingle();
  if (!profile) notFound();
  const p = profile as Row;
  const role = str(p.role);
  if (!['technician', 'admin', 'super_admin'].includes(role)) notFound();

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1));
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [assignedRes, completedRes, upcomingRes, timersRes, goalsRes, leadsRes, timelineRes, mileageRes] = await Promise.all([
    admin.from('appointments').select('id', { count: 'exact', head: true }).eq('assigned_technician_id', id),
    admin
      .from('appointments')
      .select('id, guest_name, scheduled_start, status, base_price_cents, service_slug, vehicle_description, job_completed_at')
      .eq('assigned_technician_id', id)
      .eq('status', 'completed')
      .order('job_completed_at', { ascending: false })
      .limit(12),
    admin
      .from('appointments')
      .select('id, guest_name, scheduled_start, status, service_slug, vehicle_description')
      .eq('assigned_technician_id', id)
      .in('status', ['assigned', 'confirmed', 'in_progress'])
      .gte('scheduled_start', now.toISOString())
      .order('scheduled_start', { ascending: true })
      .limit(8),
    admin.from('tech_job_timers').select('duration_seconds').eq('technician_id', id).not('duration_seconds', 'is', null).limit(500),
    admin.from('admin_goals').select('*').or(`technician_id.eq.${id},assigned_to.eq.${id}`).order('period_end', { ascending: true }).limit(20),
    admin.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_technician_id', id),
    admin
      .from('job_timeline_events')
      .select('id, event_type, created_at, appointment_id, meta')
      .eq('created_by', id)
      .order('created_at', { ascending: false })
      .limit(25),
    admin.from('job_mileage_logs').select('*').eq('created_by', id).order('created_at', { ascending: false }).limit(15),
  ]);

  const completed = (completedRes.data ?? []) as Row[];
  const completedMonth = completed.filter((a) => {
    const t = str(a.job_completed_at);
    return t && new Date(t) >= monthStart;
  }).length;

  const durations = ((timersRes.data ?? []) as Row[])
    .map((r) => (typeof r.duration_seconds === 'number' ? r.duration_seconds : 0))
    .filter((n) => n > 0);
  const avgMinutes = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60) : null;

  const revenueInfluencedCents = completed.reduce((s, a) => s + (typeof a.base_price_cents === 'number' ? a.base_price_cents : 0), 0);

  const goals = (goalsRes.data ?? []) as Row[];
  const weekSchedule = ((upcomingRes.data ?? []) as Row[]).slice(0, 7);

  return (
    <DashboardShell title={displayName(p)} subtitle='Technician profile — jobs, performance, goals, and activity.' role='admin'>
      <div className='mb-4'>
        <Link href='/admin/team' className='text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
          ← Team roster
        </Link>
      </div>

      <section className='gb-premium-hero rounded-3xl p-6'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div>
            <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>{role.replace(/_/g, ' ')}</p>
            <h2 className='mt-2 text-3xl font-black text-white'>{displayName(p)}</h2>
            {str(p.email) ? <p className='mt-1 text-sm text-zinc-400'>{str(p.email)}</p> : null}
          </div>
          <div className='grid gap-2 text-right text-sm sm:grid-cols-2'>
            <p>
              <span className='text-zinc-500'>Assigned jobs</span>
              <br />
              <strong className='font-mono text-gold-soft'>{assignedRes.count ?? 0}</strong>
            </p>
            <p>
              <span className='text-zinc-500'>Completed (all time sample)</span>
              <br />
              <strong className='font-mono text-white'>{completed.length}+</strong>
            </p>
            <p>
              <span className='text-zinc-500'>Completed this month</span>
              <br />
              <strong className='font-mono text-emerald-300'>{completedMonth}</strong>
            </p>
            <p>
              <span className='text-zinc-500'>Leads attributed</span>
              <br />
              <strong className='font-mono text-white'>{leadsRes.count ?? 0}</strong>
            </p>
          </div>
        </div>
      </section>

      <div className='mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {[
          { label: 'Revenue influenced (completed sample)', value: displayMoney(revenueInfluencedCents) },
          { label: 'Avg job time', value: avgMinutes != null ? `~${avgMinutes} min` : '—' },
          { label: 'Goals tracked', value: String(goals.length) },
          { label: 'Mileage logs', value: String((mileageRes.data ?? []).length) },
        ].map((s) => (
          <div key={s.label} className='gb-premium-card rounded-2xl border border-gold/20 p-4'>
            <p className='text-[10px] font-black uppercase tracking-wider text-zinc-500'>{s.label}</p>
            <p className='mt-2 font-mono text-xl font-black text-gold-soft'>{s.value}</p>
          </div>
        ))}
      </div>

      <div className='mt-8 grid gap-6 lg:grid-cols-2'>
        <section className='gb-premium-card rounded-2xl border border-white/10 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Upcoming jobs</p>
          <ul className='mt-4 space-y-2'>
            {weekSchedule.length === 0 ? <li className='text-sm text-zinc-500'>No upcoming assignments.</li> : null}
            {weekSchedule.map((a) => (
              <li key={str(a.id)}>
                <Link
                  href={workOrderPath(str(a.id), { shell: 'admin' })}
                  className='block rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm hover:border-gold/40'
                >
                  <strong className='text-white'>{str(a.guest_name) || 'Customer'}</strong>
                  <span className='mt-1 block text-xs text-zinc-500'>{displayChicago(a.scheduled_start)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className='gb-premium-card rounded-2xl border border-white/10 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Completed recently</p>
          <ul className='mt-4 space-y-2'>
            {completed.length === 0 ? <li className='text-sm text-zinc-500'>No completed jobs yet.</li> : null}
            {completed.map((a) => (
              <li key={str(a.id)}>
                <Link
                  href={workOrderPath(str(a.id), { shell: 'admin' })}
                  className='flex justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm hover:border-gold/40'
                >
                  <span className='text-zinc-200'>{str(a.guest_name) || str(a.vehicle_description)}</span>
                  <span className='font-mono text-gold-soft'>{displayMoney(a.base_price_cents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className='gb-premium-card rounded-2xl border border-white/10 p-5 lg:col-span-2'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Goals & progress</p>
          <ul className='mt-4 space-y-3'>
            {goals.length === 0 ? (
              <li className='text-sm text-zinc-500'>
                No goals assigned.{' '}
                <Link href='/admin/goals' className='text-gold-soft underline'>
                  Manage goals
                </Link>
              </li>
            ) : null}
            {goals.map((g) => {
              const unit = str(g.unit) || 'cents';
              const target = Number(g.target_value) || 0;
              const progress = Number(g.current_value) || 0;
              const pct = target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 0;
              const fmt = (n: number) => (unit === 'cents' ? displayMoney(n) : String(n));
              return (
                <li key={str(g.id)} className='rounded-xl border border-white/10 bg-black/40 p-3'>
                  <div className='flex justify-between gap-2 text-sm'>
                    <strong className='text-white'>{str(g.title) || 'Goal'}</strong>
                    <span className='text-zinc-500'>{str(g.period_end) ? displayChicago(g.period_end) : 'No due date'}</span>
                  </div>
                  <div className='mt-2 h-2 overflow-hidden rounded-full bg-zinc-800'>
                    <div className='h-full bg-gold transition-all' style={{ width: `${pct}%` }} />
                  </div>
                  <p className='mt-1 text-xs text-zinc-400'>
                    {fmt(progress)} / {fmt(target)} · {str(g.goal_type).replace(/_/g, ' ')}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className='gb-premium-card rounded-2xl border border-white/10 p-5 lg:col-span-2'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Activity timeline</p>
          <ul className='mt-4 max-h-80 space-y-2 overflow-y-auto'>
            {((timelineRes.data ?? []) as Row[]).length === 0 ? <li className='text-sm text-zinc-500'>No timeline events.</li> : null}
            {((timelineRes.data ?? []) as Row[]).map((e) => (
              <li key={str(e.id)} className='flex justify-between gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs'>
                <span className='text-zinc-300'>{str(e.event_type).replace(/_/g, ' ')}</span>
                <span className='text-zinc-500'>{displayChicago(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DashboardShell>
  );
}

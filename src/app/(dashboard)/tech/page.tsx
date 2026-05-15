import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TechPremiumShell, type TechAnalytics, type TechJob } from '@/components/tech/tech-premium-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function TechnicianDashboardPage() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();

  let jobs: TechJob[] = [];
  let revenueTodayCents = 0;
  let revenueWeekCents = 0;
  const analytics: TechAnalytics = { completedCount: 0, avgJobMinutes: null, revenueMonthCents: 0 };

  const techName = session.profile?.full_name?.trim() || session.user?.email?.split('@')[0] || 'Technician';
  const roleLabel = session.profile?.role ?? null;

  if (supabase && session.user) {
    const selectCols =
      'id, status, scheduled_start, guest_name, guest_phone, guest_email, vehicle_description, service_slug, vehicle_class, base_price_cents, notes, intake_completed_at';
    const { data } = await supabase
      .from('appointments')
      .select(selectCols)
      .eq('assigned_technician_id', session.user.id)
      .in('status', ['assigned', 'confirmed', 'in_progress'])
      .order('scheduled_start', { ascending: true });
    const rawRows = (data ?? []) as Record<string, unknown>[];
    const ids = rawRows.map((row) => String(row.id));

    let intakeIds = new Set<string>();
    if (ids.length > 0) {
      const { data: subs } = await supabase.from('intake_submissions').select('appointment_id').in('appointment_id', ids);
      intakeIds = new Set((subs ?? []).map((s) => String((s as { appointment_id: string }).appointment_id)));
    }

    const mediaByAppt = new Map<string, { before: number; after: number }>();
    if (ids.length > 0) {
      const { data: med } = await supabase.from('job_media').select('appointment_id, category').in('appointment_id', ids);
      for (const m of med ?? []) {
        const row = m as { appointment_id?: string; category?: string };
        const aid = String(row.appointment_id ?? '');
        const cat = String(row.category ?? '');
        const cur = mediaByAppt.get(aid) ?? { before: 0, after: 0 };
        if (cat === 'before') cur.before += 1;
        else if (cat === 'after') cur.after += 1;
        mediaByAppt.set(aid, cur);
      }
    }

    jobs = rawRows.map((row) => {
      const id = String(row.id);
      const intakeCompleted = row.intake_completed_at != null && String(row.intake_completed_at).length > 0;
      const counts = mediaByAppt.get(id);
      return {
        id,
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
        hasIntake: intakeIds.has(id) || intakeCompleted,
        beforePhotoCount: counts?.before,
        afterPhotoCount: counts?.after,
      };
    });

    const { data: done } = await supabase
      .from('appointments')
      .select('base_price_cents, job_completed_at, updated_at')
      .eq('assigned_technician_id', session.user.id)
      .eq('status', 'completed');
    const now = new Date();
    const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sow = sod - 7 * 86400000;
    const monthAgo = Date.now() - 30 * 86400000;

    for (const row of done ?? []) {
      const r = row as Record<string, unknown>;
      const completed = r.job_completed_at != null ? String(r.job_completed_at) : String(r.updated_at ?? '');
      const t = new Date(completed).getTime();
      const cents = typeof r.base_price_cents === 'number' ? r.base_price_cents : 0;
      if (!Number.isNaN(t)) {
        if (t >= sod) revenueTodayCents += cents;
        if (t >= sow) revenueWeekCents += cents;
        if (t >= monthAgo) {
          analytics.revenueMonthCents += cents;
          analytics.completedCount += 1;
        }
      }
    }

    const monthIso = new Date(monthAgo).toISOString();
    const { data: timers } = await supabase
      .from('tech_job_timers')
      .select('duration_seconds')
      .eq('technician_id', session.user.id)
      .gte('started_at', monthIso)
      .not('duration_seconds', 'is', null)
      .limit(80);
    const secs = (timers ?? [])
      .map((t) => (t as { duration_seconds?: number }).duration_seconds)
      .filter((n): n is number => typeof n === 'number' && n > 0);
    if (secs.length > 0) {
      const avgSec = secs.reduce((a, b) => a + b, 0) / secs.length;
      analytics.avgJobMinutes = Math.round(avgSec / 60);
    }
  }

  return (
    <DashboardShell title='Technician workspace' subtitle='Premium field command — jobs, revenue, and tools in one place.' role='technician'>
      <TechPremiumShell
        techName={techName}
        roleLabel={roleLabel}
        jobs={jobs}
        revenueTodayCents={revenueTodayCents}
        revenueWeekCents={revenueWeekCents}
        analytics={analytics}
      />
    </DashboardShell>
  );
}

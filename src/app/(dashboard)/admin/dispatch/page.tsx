import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DispatchBoardClient, type DispatchFallbackRow, type DispatchJobRow } from '@/components/admin/dispatch-board-client';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

const SELECT =
  'id, guest_name, guest_phone, guest_email, vehicle_description, service_slug, scheduled_start, base_price_cents, assigned_technician_id, status, service_address, notes, job_started_at, job_completed_at, archived, archived_at, deleted_at, is_test, payment_status';

function guestFromPayload(payload: unknown): { name: string | null; email: string | null; phone: string | null } {
  if (!payload || typeof payload !== 'object') return { name: null, email: null, phone: null };
  const p = payload as Record<string, unknown>;
  const name =
    typeof p.guest_name === 'string'
      ? p.guest_name
      : typeof p.guestName === 'string'
        ? p.guestName
        : typeof p.name === 'string'
          ? p.name
          : null;
  const email = typeof p.guest_email === 'string' ? p.guest_email : typeof p.email === 'string' ? p.email : null;
  const phone = typeof p.guest_phone === 'string' ? p.guest_phone : typeof p.phone === 'string' ? p.phone : null;
  return { name, email, phone };
}

export default async function AdminDispatchPage() {
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return (
      <DashboardShell title='Dispatch' subtitle='Assign jobs to technicians.' role='admin'>
        <p className='text-amber-200'>Service role unavailable — cannot load dispatch board.</p>
      </DashboardShell>
    );
  }

  const [jobsRes, techRes, fbRes] = await Promise.all([
    admin
      .from('appointments')
      .select(SELECT)
      .neq('status', 'awaiting_payment')
      .neq('status', 'test_comped')
      .eq('archived', false)
      .is('deleted_at', null)
      .eq('is_test', false)
      .order('scheduled_start', { ascending: true })
      .limit(250),
    admin.from('profiles').select('id, full_name, email, role, active').eq('role', 'technician').order('full_name', { ascending: true }),
    admin
      .from('booking_fallbacks')
      .select('id, status, payload, guest_name, guest_email, guest_phone, scheduled_start, base_price_cents, deposit_amount_cents, created_at')
      .in('status', ['pending', 'open', 'needs_review'])
      .order('created_at', { ascending: false })
      .limit(80),
  ]);

  const seen = new Set<string>();
  const jobs = ((jobsRes.data ?? []) as (DispatchJobRow & Record<string, unknown>)[])
    .filter((j) => {
      if (!j.id || seen.has(j.id)) return false;
      seen.add(j.id);
      const hay = [j.guest_email, j.guest_name, j.guest_phone, j.notes].filter(Boolean).join(' ').toLowerCase();
      return !/(^|[\s._-])(test|qa|demo|fake)([\s._-]|$)/i.test(hay);
    }) as DispatchJobRow[];
  const jobIds = jobs.map((j) => j.id);
  const jobNotes: Record<string, string> = {};
  if (jobIds.length) {
    const nq = await admin
      .from('tech_job_notes')
      .select('appointment_id, before_notes, after_notes, damage_notes, upsell_suggestions, created_at')
      .in('appointment_id', jobIds)
      .order('created_at', { ascending: false });
    if (!nq.error) {
      for (const row of nq.data ?? []) {
        const r = row as Record<string, unknown>;
        const aid = String(r.appointment_id ?? '');
        if (!aid || jobNotes[aid]) continue;
        const bits = [r.before_notes, r.after_notes, r.damage_notes, r.upsell_suggestions].filter(Boolean).map(String);
        if (bits.length) jobNotes[aid] = bits.join(' · ').slice(0, 220);
      }
    }
  }

  const techRows = (techRes.data ?? []) as { id: string; full_name: string | null; email: string | null; active?: boolean | null }[];
  const technicians = techRows.filter((t) => t.active !== false).map(({ id, full_name, email }) => ({ id, full_name, email }));

  const fallbacks: DispatchFallbackRow[] = !fbRes.error
    ? ((fbRes.data ?? []) as Record<string, unknown>[]).map((r) => {
        const g = guestFromPayload(r.payload);
        return {
          id: String(r.id),
          status: String(r.status ?? 'pending'),
          guest_name: (r.guest_name as string | null) ?? g.name,
          guest_email: (r.guest_email as string | null) ?? g.email,
          guest_phone: (r.guest_phone as string | null) ?? g.phone,
          scheduled_start: (r.scheduled_start as string | null) ?? null,
          base_price_cents: typeof r.base_price_cents === 'number' ? r.base_price_cents : null,
          deposit_amount_cents: typeof r.deposit_amount_cents === 'number' ? r.deposit_amount_cents : null,
          created_at: String(r.created_at ?? ''),
        };
      })
    : [];

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
      {fbRes.error ? <p className='mb-4 text-xs text-amber-200'>Fallback queue: {fbRes.error.message}</p> : null}
      <DispatchBoardClient jobs={jobs} technicians={technicians} fallbacks={fallbacks} jobNotes={jobNotes} />
    </DashboardShell>
  );
}

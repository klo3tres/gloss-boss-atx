import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { LeadsAdminClient, type AssignmentEventRow } from '@/components/admin/leads-admin-client';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function AdminLeadsPage() {
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return (
      <DashboardShell title='Leads' subtitle='Field and web leads — mini CRM.' role='admin'>
        <p className='text-amber-200'>Service role unavailable — cannot load leads.</p>
      </DashboardShell>
    );
  }

  const [leadsRes, techRes, evRes] = await Promise.all([
    admin.from('leads').select('*').order('created_at', { ascending: false }).limit(200),
    admin.from('profiles').select('id, full_name, email, role, active').eq('role', 'technician').order('full_name', { ascending: true }),
    admin.from('assignment_events').select('id, action, technician_id, previous_technician_id, actor_id, created_at, note, entity_id').eq('entity_type', 'lead').order('created_at', { ascending: false }).limit(600),
  ]);

  const rows = (leadsRes.data ?? []) as Record<string, unknown>[];
  const techRaw = (techRes.data ?? []) as { id: string; full_name: string | null; email: string | null; active?: boolean | null }[];
  const technicians = techRaw.filter((t) => t.active !== false).map(({ id, full_name, email }) => ({ id, full_name, email }));
  const techById: Record<string, string> = {};
  for (const t of technicians) {
    techById[t.id] = t.full_name?.trim() || t.email?.trim() || t.id.slice(0, 8);
  }
  const eventsByLead: Record<string, AssignmentEventRow[]> = {};
  for (const e of evRes.data ?? []) {
    const row = e as AssignmentEventRow & { entity_id?: string };
    const lid = String(row.entity_id ?? '');
    if (!lid) continue;
    if (!eventsByLead[lid]) eventsByLead[lid] = [];
    if (eventsByLead[lid].length < 25) {
      eventsByLead[lid].push({
        id: String(row.id),
        action: String(row.action),
        technician_id: row.technician_id != null ? String(row.technician_id) : null,
        previous_technician_id: row.previous_technician_id != null ? String(row.previous_technician_id) : null,
        actor_id: row.actor_id != null ? String(row.actor_id) : null,
        created_at: String(row.created_at),
        note: row.note != null ? String(row.note) : null,
      });
    }
  }

  return (
    <DashboardShell title='Leads' subtitle='Dispatch assignments, pool, and conversion — wired assignment history.' role='admin'>
      <Link href='/admin/super' className='mb-4 inline-block text-xs font-bold uppercase text-gold-soft underline'>
        ← Command center
      </Link>
      {leadsRes.error ? (
        <p className='mb-4 text-sm text-amber-200'>Leads query: {leadsRes.error.message}. Run migration 000023 if columns are missing.</p>
      ) : null}
      {techRes.error ? <p className='mb-4 text-xs text-amber-200'>Technician list: {techRes.error.message}</p> : null}
      <LeadsAdminClient leads={rows} technicians={technicians} eventsByLead={eventsByLead} techById={techById} />
    </DashboardShell>
  );
}

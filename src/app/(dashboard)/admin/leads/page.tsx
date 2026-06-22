import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { LeadsAdminClient, type AssignmentEventRow } from '@/components/admin/leads-admin-client';
import { loadEstimatesForLead, type ServiceEstimate } from '@/lib/service-estimates';
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

  const [leadsRes, techRes, evRes, servicesRes, pricesRes] = await Promise.all([
    admin.from('leads').select('*').order('created_at', { ascending: false }).limit(200),
    admin.from('profiles').select('id, full_name, email, role, active').eq('role', 'technician').order('full_name', { ascending: true }),
    admin.from('assignment_events').select('id, action, technician_id, previous_technician_id, actor_id, created_at, note, entity_id').eq('entity_type', 'lead').order('created_at', { ascending: false }).limit(600),
    admin.from('services').select('slug, title').eq('active', true).order('title'),
    admin.from('service_prices').select('price_cents, vehicle_class, services(slug)').eq('vehicle_class', 'standard').limit(50),
  ]);

  const rows = ((leadsRes.data ?? []) as Record<string, unknown>[]).filter(
    (r) => r.archived !== true && !r.archived_at && !r.deleted_at && r.status !== 'deleted',
  );
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

  const priceBySlug = new Map<string, number>();
  for (const row of pricesRes.data ?? []) {
    const r = row as { price_cents?: number; services?: { slug?: string } | { slug?: string }[] | null };
    const svc = r.services;
    const slug = Array.isArray(svc) ? svc[0]?.slug : svc?.slug;
    if (slug && typeof r.price_cents === 'number') priceBySlug.set(String(slug), r.price_cents);
  }

  const serviceOptions = (servicesRes.data ?? []).map((s) => {
    const row = s as { slug: string; title: string };
    return { slug: row.slug, title: row.title, priceCents: priceBySlug.get(row.slug) };
  });

  const estimatesByLead: Record<string, ServiceEstimate[]> = {};
  await Promise.all(
    rows.slice(0, 40).map(async (lead) => {
      const id = String(lead.id);
      estimatesByLead[id] = await loadEstimatesForLead(admin, id);
    }),
  );

  return (
    <DashboardShell title='Leads' subtitle='Dispatch assignments, pool, and conversion — wired assignment history.' role='admin'>
      <Link href='/admin/super' className='mb-4 inline-block text-xs font-bold uppercase text-gold-soft underline'>
        ← Command center
      </Link>
      {leadsRes.error ? (
        <p className='mb-4 text-sm text-amber-200'>Leads query: {leadsRes.error.message}. Run migration 000023 if columns are missing.</p>
      ) : null}
      {techRes.error ? <p className='mb-4 text-xs text-amber-200'>Technician list: {techRes.error.message}</p> : null}
      <LeadsAdminClient
        leads={rows}
        technicians={technicians}
        eventsByLead={eventsByLead}
        techById={techById}
        estimatesByLead={estimatesByLead}
        serviceOptions={serviceOptions}
      />
    </DashboardShell>
  );
}

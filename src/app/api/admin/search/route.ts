import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { workOrderPath } from '@/lib/work-order-links';

export const runtime = 'nodejs';

export type AdminSearchResult = {
  id: string;
  type: 'customer' | 'work_order' | 'opportunity' | 'lead' | 'vehicle' | 'project' | 'technician';
  title: string;
  subtitle: string;
  href: string;
};

export async function GET(request: Request) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    return NextResponse.json({ results: [] as AdminSearchResult[] });
  }

  const like = `%${q.replace(/[%_]/g, '')}%`;
  const results: AdminSearchResult[] = [];

  const [byName, byEmail, byPhone, appointments, opportunities, vehicles, projects, techs] = await Promise.all([
    admin.from('customers').select('id, full_name, email, phone').ilike('full_name', like).limit(5),
    admin.from('customers').select('id, full_name, email, phone').ilike('email', like).limit(5),
    admin.from('customers').select('id, full_name, email, phone').ilike('phone', like).limit(5),
    admin
      .from('appointments')
      .select('id, guest_name, guest_email, vehicle_description, service_slug')
      .or(`guest_name.ilike.${like},guest_email.ilike.${like},vehicle_description.ilike.${like}`)
      .order('scheduled_start', { ascending: false })
      .limit(8),
    admin.from('titan_opportunities').select('id, title, author_name, contact_phone, status').ilike('title', like).limit(6),
    admin.from('vehicles').select('id, customer_id, year, make, model, color, nickname').or(`make.ilike.${like},model.ilike.${like},nickname.ilike.${like}`).limit(5),
    admin.from('titan_projects').select('id, title, status, business_id').ilike('title', like).limit(5),
    admin.from('profiles').select('id, full_name, email, role').in('role', ['technician', 'admin', 'super_admin']).ilike('full_name', like).limit(5),
  ]);

  const customerRows = [...(byName.data ?? []), ...(byEmail.data ?? []), ...(byPhone.data ?? [])];
  const seenCustomers = new Set<string>();
  for (const c of customerRows) {
    const row = c as Record<string, unknown>;
    const id = String(row.id);
    if (seenCustomers.has(id)) continue;
    seenCustomers.add(id);
    results.push({
      id,
      type: 'customer',
      title: String(row.full_name ?? row.email ?? 'Customer'),
      subtitle: String(row.email ?? row.phone ?? ''),
      href: `/admin/customers/${id}`,
    });
  }

  for (const a of appointments.data ?? []) {
    const row = a as Record<string, unknown>;
    const id = String(row.id);
    results.push({
      id,
      type: 'work_order',
      title: String(row.guest_name ?? 'Job'),
      subtitle: `${String(row.service_slug ?? 'service').replace(/-/g, ' ')} · ${String(row.vehicle_description ?? id.slice(0, 8))}`,
      href: workOrderPath(id, { source: 'appointment', shell: 'admin' }),
    });
  }

  for (const o of opportunities.data ?? []) {
    const row = o as Record<string, unknown>;
    results.push({
      id: String(row.id),
      type: 'opportunity',
      title: String(row.title ?? 'Opportunity'),
      subtitle: `${String(row.author_name ?? '')} · ${String(row.status ?? '')}`.trim(),
      href: `/admin/titan/opportunities?open=${encodeURIComponent(String(row.id))}`,
    });
  }

  for (const v of vehicles.data ?? []) {
    const row = v as Record<string, unknown>;
    const label = [row.year, row.make, row.model, row.nickname].filter(Boolean).join(' ') || 'Vehicle';
    results.push({
      id: String(row.id),
      type: 'vehicle',
      title: String(label),
      subtitle: String(row.color ?? ''),
      href: `/admin/vehicles/${row.id}`,
    });
  }

  for (const p of projects.data ?? []) {
    const row = p as Record<string, unknown>;
    results.push({
      id: String(row.id),
      type: 'project',
      title: String(row.title ?? 'Project'),
      subtitle: String(row.status ?? ''),
      href: '/titan/projects',
    });
  }

  for (const t of techs.data ?? []) {
    const row = t as Record<string, unknown>;
    results.push({
      id: String(row.id),
      type: 'technician',
      title: String(row.full_name ?? row.email ?? 'Staff'),
      subtitle: String(row.role ?? ''),
      href: '/admin/team',
    });
  }

  try {
    const lr = await admin
      .from('titan_lead_radar_items')
      .select('id, source_name, author_name, phone, status')
      .or(`source_name.ilike.${like},author_name.ilike.${like}`)
      .limit(6);
    for (const l of lr.data ?? []) {
      const row = l as Record<string, unknown>;
      results.push({
        id: String(row.id),
        type: 'lead',
        title: String(row.source_name ?? row.author_name ?? 'Lead'),
        subtitle: String(row.phone ?? row.status ?? ''),
        href: '/admin/titan/lead-radar',
      });
    }
  } catch {
    /* optional */
  }

  return NextResponse.json({ results: results.slice(0, 24) });
}

import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { workOrderPath } from '@/lib/work-order-links';

export const runtime = 'nodejs';

export type AdminSearchResult = {
  id: string;
  type: 'customer' | 'work_order' | 'opportunity' | 'lead';
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

  const [byName, byEmail, byPhone, appointments, opportunities] = await Promise.all([
    admin.from('customers').select('id, full_name, email, phone').ilike('full_name', like).limit(5),
    admin.from('customers').select('id, full_name, email, phone').ilike('email', like).limit(5),
    admin.from('customers').select('id, full_name, email, phone').ilike('phone', like).limit(5),
    admin
      .from('appointments')
      .select('id, guest_name, guest_email, vehicle_description, service_slug')
      .or(`guest_name.ilike.${like},guest_email.ilike.${like},vehicle_description.ilike.${like}`)
      .order('scheduled_start', { ascending: false })
      .limit(8),
    admin
      .from('titan_revenue_opportunities')
      .select('id, title, contact_name, contact_phone, status')
      .ilike('title', like)
      .limit(6),
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
    results.push({
      id: String(o.id),
      type: 'opportunity',
      title: String(o.title ?? 'Opportunity'),
      subtitle: `${String(o.contact_name ?? '')} · ${String(o.status ?? '')}`.trim(),
      href: `/titan/opportunities?open=${encodeURIComponent(String(o.id))}`,
    });
  }

  try {
    const lr = await admin.from('titan_lead_radar').select('id, business_name, contact_name, phone, status').ilike('business_name', like).limit(6);
    for (const l of lr.data ?? []) {
      results.push({
        id: String(l.id),
        type: 'lead',
        title: String(l.business_name ?? l.contact_name ?? 'Lead'),
        subtitle: String(l.phone ?? l.status ?? ''),
        href: '/admin/leads',
      });
    }
  } catch {
    /* optional table */
  }

  return NextResponse.json({ results: results.slice(0, 20) });
}

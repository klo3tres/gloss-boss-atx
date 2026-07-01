import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AdminTitanHero } from '@/components/titan/admin-titan-hero';
import { AdminAddJobWizard } from '@/components/admin/admin-add-job-wizard';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { normalizeAddonForPublic } from '@/lib/addons-shared';

export const dynamic = 'force-dynamic';

export default async function AdminAddJobPage({
  searchParams,
}: {
  searchParams?: Promise<{ mode?: string; error?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) notFound();

  const [servicesRes, addonsRes, techsRes] = await Promise.all([
    admin.from('services').select('slug, title').eq('active', true).order('sort_order', { ascending: true }),
    admin.from('addons').select('*').eq('active', true).order('label', { ascending: true }),
    admin.from('profiles').select('id, full_name, email').in('role', ['technician', 'admin', 'super_admin']).order('full_name'),
  ]);

  const services = (servicesRes.data ?? []).map((s) => ({
    slug: String((s as { slug: string }).slug),
    title: String((s as { title?: string }).title ?? (s as { slug: string }).slug),
  }));

  const addons = ((addonsRes.data ?? []) as Record<string, unknown>[]).map((r) => {
    const n = normalizeAddonForPublic(r);
    return { slug: n.slug, label: n.label, priceCents: n.price_cents };
  });

  const technicians = (techsRes.data ?? []).map((t) => ({
    id: String((t as { id: string }).id),
    name: String((t as { full_name?: string }).full_name ?? (t as { email?: string }).email ?? 'Tech'),
  }));

  return (
    <DashboardShell title="Add Job" subtitle="Create scheduled or completed customer jobs from admin." role="admin">
      <AdminTitanHero
        title="Add Job"
        sentence="Match or create the customer, auto-price the package, block the calendar, and notify Titan."
        kpi="< 60s"
        kpiHint="Future scheduled · completed past · quote-only · with auto pricing"
        primaryHref="/admin/work-orders"
        primaryLabel="Work orders"
        secondaryLinks={[{ href: '/admin/calendar', label: 'Calendar' }]}
      />
      <AdminAddJobWizard
        services={services.length ? services : [{ slug: 'full-detail', title: 'Full detail' }]}
        addons={addons}
        technicians={technicians}
        defaultMode={params.mode === 'completed' ? 'completed' : 'scheduled'}
        errorMessage={params.error ? decodeURIComponent(params.error) : undefined}
      />
    </DashboardShell>
  );
}

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TechWorkflowWizard } from '@/components/tech/tech-workflow-wizard';
import { getSessionWithProfile } from '@/lib/auth/session';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';

export const dynamic = 'force-dynamic';

export default async function TechWorkflowPage() {
  const session = await getSessionWithProfile();
  let role = parseAppRole(session.profile?.role ?? null);
  if (!role && (session.user?.email ?? '').trim().toLowerCase() === OWNER_LOGIN_EMAIL) role = 'super_admin';
  const witnessName =
    session.profile?.full_name?.trim() ||
    session.user?.email?.split('@')[0] ||
    'Gloss Boss technician';

  return (
    <DashboardShell
      title='Walk-in workflow'
      subtitle='Field walk-in path: quote, agreement, before photos, timer, and start job — separate from public booking.'
      role='technician'
    >
      <TechWorkflowWizard witness={{ id: session.user?.id ?? null, name: String(witnessName), role: role ?? 'technician' }} />
    </DashboardShell>
  );
}

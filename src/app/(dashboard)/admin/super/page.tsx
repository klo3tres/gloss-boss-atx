import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { SuperAdminDashboard } from '@/components/dashboard/super-admin-dashboard';

export default function SuperAdminDashboardPage() {
  return (
    <DashboardShell
      title='Super admin command center'
      subtitle='Live Supabase metrics, operations shortcuts, and business health at a glance.'
      role='super_admin'
    >
      <SuperAdminDashboard />
    </DashboardShell>
  );
}

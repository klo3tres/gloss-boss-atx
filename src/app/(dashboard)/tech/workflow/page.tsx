import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TechWorkflowWizard } from '@/components/tech/tech-workflow-wizard';

export const dynamic = 'force-dynamic';

export default function TechWorkflowPage() {
  return (
    <DashboardShell
      title='Walk-in workflow'
      subtitle='Field walk-in path: quote, agreement, before photos, timer, and start job — separate from public booking.'
      role='technician'
    >
      <TechWorkflowWizard />
    </DashboardShell>
  );
}

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { QaChecklistClient } from '@/components/admin/qa-checklist-client';

export const dynamic = 'force-dynamic';

export default function AdminQaChecklistPage() {
  return (
    <DashboardShell
      title='Production QA checklist'
      subtitle='Track manual verification before field days and releases. Status is saved in this browser.'
      role='admin'
    >
      <p className='mb-6 text-sm text-zinc-400'>
        Run each flow in production or staging with real Stripe/Twilio keys. Mark pass/fail/manual and add notes. This does not
        replace automated tests — it is your operator runbook.
      </p>
      <QaChecklistClient />
    </DashboardShell>
  );
}

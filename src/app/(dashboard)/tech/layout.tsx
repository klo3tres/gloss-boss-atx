'use client';

import { DashboardRoleGate } from '@/components/auth/dashboard-role-gate';
import { SafeRenderBoundary } from '@/components/ui/safe-render-boundary';
import { OutboundMessageProvider } from '@/components/admin/outbound-message-provider';
import { StaffAppointmentOperationsMonitor } from '@/components/operations/staff-appointment-operations-monitor';

export default function TechLayout({ children }: { children: React.ReactNode }) {
  return (
    <SafeRenderBoundary label='Technician dashboard'>
      <DashboardRoleGate variant='tech'>
        <OutboundMessageProvider>
          <StaffAppointmentOperationsMonitor />
          {children}
        </OutboundMessageProvider>
      </DashboardRoleGate>
    </SafeRenderBoundary>
  );
}

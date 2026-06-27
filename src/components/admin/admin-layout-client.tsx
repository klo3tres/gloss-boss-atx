'use client';

import { usePathname } from 'next/navigation';
import { DashboardRoleGate } from '@/components/auth/dashboard-role-gate';
import { SafeRenderBoundary } from '@/components/ui/safe-render-boundary';
import { OutboundMessageProvider } from '@/components/admin/outbound-message-provider';
import { ToastProvider } from '@/components/ui/toast-provider';
import { AdminAutomationBoot } from '@/components/admin/admin-automation-boot';

export function AdminLayoutClient({
  children,
  leadRadarAutoEnabled,
  lastLeadRadarScanAt,
  scanFrequency,
}: {
  children: React.ReactNode;
  leadRadarAutoEnabled: boolean;
  lastLeadRadarScanAt: string | null;
  scanFrequency: string;
}) {
  const pathname = usePathname();
  const variant = pathname.startsWith('/admin/super') ? 'super_admin_only' : 'admin';

  return (
    <SafeRenderBoundary label='Admin dashboard'>
      <DashboardRoleGate variant={variant}>
        <ToastProvider>
          <OutboundMessageProvider>
            <AdminAutomationBoot
              leadRadarAutoEnabled={leadRadarAutoEnabled}
              lastLeadRadarScanAt={lastLeadRadarScanAt}
              scanFrequency={scanFrequency}
            />
            {children}
          </OutboundMessageProvider>
        </ToastProvider>
      </DashboardRoleGate>
    </SafeRenderBoundary>
  );
}

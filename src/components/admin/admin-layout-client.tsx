'use client';

import { usePathname } from 'next/navigation';
import { DashboardRoleGate } from '@/components/auth/dashboard-role-gate';
import { SafeRenderBoundary } from '@/components/ui/safe-render-boundary';
import { OutboundMessageProvider } from '@/components/admin/outbound-message-provider';
import { ToastProvider } from '@/components/ui/toast-provider';

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const variant = pathname.startsWith('/admin/super') ? 'super_admin_only' : 'admin';

  return (
    <SafeRenderBoundary label='Admin dashboard'>
      <DashboardRoleGate variant={variant}>
        <ToastProvider>
          <OutboundMessageProvider>{children}</OutboundMessageProvider>
        </ToastProvider>
      </DashboardRoleGate>
    </SafeRenderBoundary>
  );
}

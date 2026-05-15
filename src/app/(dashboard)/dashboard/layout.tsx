'use client';

import { DashboardRoleGate } from '@/components/auth/dashboard-role-gate';
import { SafeRenderBoundary } from '@/components/ui/safe-render-boundary';

export default function CustomerDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SafeRenderBoundary label='Dashboard'>
      <DashboardRoleGate variant='customer'>{children}</DashboardRoleGate>
    </SafeRenderBoundary>
  );
}

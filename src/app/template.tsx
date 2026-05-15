'use client';

import { GlobalRuntimeGuard } from '@/components/layout/global-runtime-guard';
import { RootClientBoundary } from '@/components/layout/root-client-boundary';
import { SiteChrome } from '@/components/layout/site-chrome';
import { StabilityDiagnosticsClient } from '@/components/layout/stability-diagnostics-client';

/**
 * All client chrome + error boundary + diagnostics live here so `app/layout.tsx`
 * stays a static shell (html → body → children) only.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div
      id='gb-app-shell'
      style={{
        minHeight: '100vh',
        backgroundColor: '#000000',
        color: '#e4e4e7',
      }}
    >
      <GlobalRuntimeGuard />
      <StabilityDiagnosticsClient />
      <RootClientBoundary>
        <SiteChrome>{children}</SiteChrome>
      </RootClientBoundary>
    </div>
  );
}

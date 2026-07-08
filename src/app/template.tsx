'use client';

import { GlobalRuntimeGuard } from '@/components/layout/global-runtime-guard';
import { RootClientBoundary } from '@/components/layout/root-client-boundary';
import { SiteChrome } from '@/components/layout/site-chrome';
import { TitanGlobalAssistant } from '@/components/titan/titan-global-assistant';
import { StabilityDiagnosticsClient } from '@/components/layout/stability-diagnostics-client';
import { ThemeBootstrap } from '@/components/theme/theme-bootstrap';

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
        backgroundColor: 'var(--gb-bg, #000000)',
        color: 'var(--gb-fg, #e4e4e7)',
      }}
    >
      <GlobalRuntimeGuard />
      <ThemeBootstrap />
      <StabilityDiagnosticsClient />
      <RootClientBoundary>
        <SiteChrome>{children}</SiteChrome>
        <TitanGlobalAssistant />
      </RootClientBoundary>
    </div>
  );
}

'use client';

import { SafeRenderBoundary } from '@/components/ui/safe-render-boundary';

export function RootClientBoundary({ children }: { children: React.ReactNode }) {
  return <SafeRenderBoundary label='App'>{children}</SafeRenderBoundary>;
}

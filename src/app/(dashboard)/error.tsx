'use client';

import SegmentError from '@/components/shared/segment-error';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} title="Dashboard error" homeHref="/dashboard" homeLabel="Dashboard" />;
}

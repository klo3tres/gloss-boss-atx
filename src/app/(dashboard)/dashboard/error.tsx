'use client';

import SegmentError from '@/components/shared/segment-error';

export default function CustomerDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} title="Dashboard error" homeHref="/dashboard" homeLabel="Dashboard" />;
}

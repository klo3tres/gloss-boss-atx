'use client';

import SegmentError from '@/components/shared/segment-error';

export default function WorkOrdersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} title="Work orders error" homeHref="/admin/work-orders" homeLabel="Work orders" />;
}

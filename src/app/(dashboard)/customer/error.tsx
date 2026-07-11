'use client';

import SegmentError from '@/components/shared/segment-error';

export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} title="Customer portal error" homeHref="/customer" homeLabel="Customer" />;
}

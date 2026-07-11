'use client';

import SegmentError from '@/components/shared/segment-error';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} title="Admin error" homeHref="/admin" homeLabel="Admin" />;
}

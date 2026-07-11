'use client';

import SegmentError from '@/components/shared/segment-error';

export default function TitanError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} title="Titan error" homeHref="/admin/titan" homeLabel="Titan" />;
}

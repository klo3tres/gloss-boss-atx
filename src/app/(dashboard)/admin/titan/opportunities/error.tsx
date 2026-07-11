'use client';

import SegmentError from '@/components/shared/segment-error';

export default function OpportunitiesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SegmentError
      error={error}
      reset={reset}
      title="Opportunities error"
      homeHref="/admin/titan/opportunities"
      homeLabel="Opportunities"
    />
  );
}

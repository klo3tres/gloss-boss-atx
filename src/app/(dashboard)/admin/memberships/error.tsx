'use client';

import SegmentError from '@/components/shared/segment-error';

export default function MembershipsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} title="Memberships error" homeHref="/admin/memberships" homeLabel="Memberships" />;
}

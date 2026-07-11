'use client';

import SegmentError from '@/components/shared/segment-error';

export default function TechError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} title="Tech portal error" homeHref="/tech" homeLabel="Tech portal" />;
}

export type WorkOrderSource = 'appointment' | 'fallback';

/** Canonical work order URL (admin route redirects to tech console). */
export function workOrderPath(
  workOrderId: string,
  opts?: { source?: WorkOrderSource; shell?: 'admin' | 'technician' },
): string {
  const q = new URLSearchParams();
  if (opts?.source === 'fallback') q.set('source', 'fallback');
  if (opts?.shell === 'admin') q.set('shell', 'admin');
  const qs = q.toString();
  return `/admin/work-orders/${encodeURIComponent(workOrderId)}${qs ? `?${qs}` : ''}`;
}

export function workOrderRecapturePath(
  workOrderId: string,
  opts?: { source?: WorkOrderSource; shell?: 'admin' | 'technician' },
): string {
  const q = new URLSearchParams();
  if (opts?.source === 'fallback') q.set('source', 'fallback');
  if (opts?.shell === 'admin') q.set('shell', 'admin');
  const qs = q.toString();
  return `/tech/work-orders/${encodeURIComponent(workOrderId)}/recapture-agreement${qs ? `?${qs}` : ''}`;
}

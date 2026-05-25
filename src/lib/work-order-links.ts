export type WorkOrderSource = 'appointment' | 'fallback';

/** Canonical field console — technicians use this directly; admins pass shell=admin. */
export function workOrderPath(
  workOrderId: string,
  opts?: { source?: WorkOrderSource; shell?: 'admin' | 'technician' },
): string {
  const q = new URLSearchParams();
  if (opts?.source === 'fallback') q.set('source', 'fallback');
  if (opts?.shell === 'admin') q.set('shell', 'admin');
  const qs = q.toString();
  return `/tech/work-orders/${encodeURIComponent(workOrderId)}${qs ? `?${qs}` : ''}`;
}

/** Legacy admin list links — redirect page preserves shell=admin. */
export function adminWorkOrderRedirectPath(
  workOrderId: string,
  opts?: { source?: WorkOrderSource },
): string {
  const q = new URLSearchParams({ shell: 'admin' });
  if (opts?.source === 'fallback') q.set('source', 'fallback');
  return `/admin/work-orders/${encodeURIComponent(workOrderId)}?${q.toString()}`;
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

export function WorkOrderDebugPanel(props: {
  workOrderId: string;
  canonicalId: string;
  source: string;
  appointmentId: string;
  fallbackId: string;
  customerId: string;
  paymentIds: string[];
  agreementId: string;
  vehicleCount: number;
  photoCount: number;
  workflowSessionIds: string[];
}) {
  return (
    <details className='gb-no-print rounded-2xl border border-dashed border-amber-500/40 bg-black/50 p-4 text-xs text-zinc-400'>
      <summary className='cursor-pointer font-black uppercase tracking-wider text-amber-200'>QA debug (admin)</summary>
      <dl className='mt-3 grid gap-1 font-mono sm:grid-cols-2'>
        <dt>work_order_id</dt>
        <dd className='text-zinc-200'>{props.workOrderId}</dd>
        <dt>canonical_id</dt>
        <dd className='text-zinc-200'>{props.canonicalId}</dd>
        <dt>source</dt>
        <dd className='text-zinc-200'>{props.source}</dd>
        <dt>appointment_id</dt>
        <dd className='text-zinc-200'>{props.appointmentId || '—'}</dd>
        <dt>fallback_booking_id</dt>
        <dd className='text-zinc-200'>{props.fallbackId || '—'}</dd>
        <dt>customer_id</dt>
        <dd className='text-zinc-200'>{props.customerId || '—'}</dd>
        <dt>payment_ids</dt>
        <dd className='text-zinc-200'>{props.paymentIds.length ? props.paymentIds.join(', ') : '—'}</dd>
        <dt>agreement_id</dt>
        <dd className='text-zinc-200'>{props.agreementId || '—'}</dd>
        <dt>vehicle_count</dt>
        <dd className='text-zinc-200'>{props.vehicleCount}</dd>
        <dt>photo_count</dt>
        <dd className='text-zinc-200'>{props.photoCount}</dd>
        <dt>workflow_sessions</dt>
        <dd className='text-zinc-200'>{props.workflowSessionIds.length ? props.workflowSessionIds.join(', ') : '—'}</dd>
      </dl>
    </details>
  );
}

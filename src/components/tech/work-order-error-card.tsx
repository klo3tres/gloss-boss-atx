import Link from 'next/link';

export function WorkOrderErrorCard({
  workOrderId,
  message,
  detail,
  backHref,
}: {
  workOrderId: string;
  message: string;
  detail?: string;
  backHref: string;
}) {
  return (
    <div className='rounded-3xl border border-amber-500/35 bg-amber-500/10 p-6'>
      <p className='text-xs font-black uppercase tracking-[0.2em] text-amber-200'>Work order {workOrderId}</p>
      <h2 className='mt-2 text-xl font-black text-white'>Could not load full work order</h2>
      <p className='mt-2 text-sm text-zinc-300'>{message}</p>
      {detail ? <p className='mt-2 font-mono text-xs text-red-300/90'>{detail}</p> : null}
      <div className='mt-6 flex flex-wrap gap-3'>
        <Link href={backHref} className='rounded-xl border border-white/20 px-4 py-2 text-xs font-black uppercase text-zinc-200'>
          Back
        </Link>
        <Link
          href={`/tech/work-orders/${encodeURIComponent(workOrderId)}`}
          className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black'
        >
          Retry
        </Link>
      </div>
    </div>
  );
}

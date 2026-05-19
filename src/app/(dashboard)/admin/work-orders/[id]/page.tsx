import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export const dynamic = 'force-dynamic';

export default async function AdminWorkOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const source = typeof sp.source === 'string' ? sp.source : '';
  const techHref = `/tech/work-orders/${encodeURIComponent(id)}${source ? `?source=${encodeURIComponent(source)}` : ''}`;
  return (
    <DashboardShell title='Admin work order detail' subtitle='Admin/super-admin launch page for full operational work order controls.' role='admin'>
      <section className='rounded-3xl border border-gold/25 bg-gradient-to-br from-zinc-950 via-black to-zinc-950 p-6 shadow-[0_0_45px_rgba(212,166,77,0.12)]'>
        <p className='text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Full work order controls</p>
        <h1 className='mt-3 text-3xl font-black text-white'>Open operational work order</h1>
        <p className='mt-2 max-w-2xl text-sm text-zinc-400'>
          Admin and super admin can open the same live work order console technicians use. It includes customer, vehicles,
          service address, payments, receipts, agreement, intake, photos, notes, timers, status, cash payment, and notifications.
        </p>
        <div className='mt-5 flex flex-wrap gap-3'>
          <Link href={techHref} className='rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase tracking-wider text-black'>Open Work Order Console</Link>
          <Link href='/admin/work-orders' className='rounded-xl border border-white/15 px-5 py-3 text-xs font-black uppercase tracking-wider text-zinc-300'>Back to Work Orders</Link>
        </div>
      </section>
    </DashboardShell>
  );
}

export type DashboardSkeletonVariant = 'admin' | 'super_admin_only' | 'tech' | 'customer';

const label: Record<DashboardSkeletonVariant, string> = {
  admin: 'Admin',
  super_admin_only: 'Super Admin',
  tech: 'Technician',
  customer: 'Customer',
};

export function DashboardSkeleton({ variant }: { variant: DashboardSkeletonVariant }) {
  const panel = label[variant];

  return (
    <main className='min-h-screen animate-pulse bg-background text-foreground'>
      <div className='mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,280px)_1fr]'>
        <aside className='order-2 rounded-2xl border border-gold/10 bg-zinc-950/80 p-5 lg:order-1'>
          <div className='h-3 w-24 rounded bg-zinc-800' />
          <div className='mt-4 h-6 w-40 rounded bg-zinc-800' />
          <div className='mt-6 space-y-2'>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className='h-10 rounded-lg bg-zinc-800/80' />
            ))}
          </div>
        </aside>
        <section className='order-1 space-y-6 lg:order-2'>
          <header className='rounded-2xl border border-gold/10 bg-zinc-950/80 p-5'>
            <div className='h-4 w-32 rounded bg-zinc-800' />
            <div className='mt-4 h-9 max-w-md rounded bg-zinc-800' />
            <div className='mt-3 h-4 w-full max-w-lg rounded bg-zinc-800/70' />
          </header>
          <div className='rounded-2xl border border-gold/10 bg-zinc-950/80 p-6'>
            <div className='h-5 w-48 rounded bg-zinc-800' />
            <div className='mt-4 h-24 rounded-lg bg-zinc-800/60' />
            <div className='mt-4 h-24 rounded-lg bg-zinc-800/40' />
          </div>
          <p className='sr-only'>{panel} dashboard loading</p>
        </section>
      </div>
    </main>
  );
}

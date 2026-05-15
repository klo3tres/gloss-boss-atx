export default function DashboardRouteLoading() {
  return (
    <main className='flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-foreground'>
      <div className='h-10 w-10 animate-spin rounded-full border-2 border-gold/30 border-t-gold-soft' aria-hidden />
      <div className='text-center'>
        <p className='text-xs font-bold uppercase tracking-[0.25em] text-gold-soft'>Gloss Boss ATX</p>
        <p className='mt-2 text-sm text-zinc-400'>Loading your dashboard…</p>
      </div>
    </main>
  );
}

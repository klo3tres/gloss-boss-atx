export default function ServicesLoading() {
  return (
    <main className='min-h-screen bg-background px-4 pb-16 pt-24 sm:px-6'>
      <div className='mx-auto max-w-6xl animate-pulse space-y-4'>
        <div className='h-8 w-64 rounded bg-zinc-800' />
        <div className='h-4 w-96 max-w-full rounded bg-zinc-900' />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='h-36 rounded-2xl border border-white/10 bg-zinc-900/80' />
        ))}
      </div>
    </main>
  );
}

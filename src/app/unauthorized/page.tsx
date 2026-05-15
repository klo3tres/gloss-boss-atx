import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <main className='flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground'>
      <h1 className='text-2xl font-black uppercase tracking-wider text-red-400'>UNAUTHORIZED</h1>
      <p className='max-w-md text-sm text-zinc-400'>Sign in is required to open this dashboard. You will not be redirected in a loop from here.</p>
      <Link href='/login' className='rounded-lg border border-gold/40 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gold-soft'>
        Go to login
      </Link>
    </main>
  );
}

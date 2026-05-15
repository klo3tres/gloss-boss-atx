import Link from 'next/link';

export const metadata = {
  title: 'Configure environment | Gloss Boss ATX',
};

export default function SetupPage() {
  return (
    <main className='min-h-screen bg-background px-4 py-20 text-foreground sm:px-6'>
      <div className='mx-auto max-w-2xl rounded-2xl border border-amber-500/30 bg-zinc-950 p-8'>
        <p className='text-xs font-bold uppercase tracking-[0.2em] text-amber-200'>Configuration required</p>
        <h1 className='mt-3 text-3xl font-black uppercase'>Supabase is not connected</h1>
        <p className='mt-4 text-sm leading-relaxed text-zinc-300'>
          The admin and customer dashboards need your Supabase project URL and anon key. Without them, the server cannot create a database client (this is what caused the runtime error you saw).
        </p>
        <ol className='mt-6 list-decimal space-y-3 pl-5 text-sm text-zinc-200'>
          <li>
            Copy <code className='rounded bg-black px-1.5 py-0.5 text-gold-soft'>.env.local.example</code> (or <code className='text-gold-soft'>env.local.example</code>) to{' '}
            <code className='rounded bg-black px-1.5 py-0.5 text-gold-soft'>.env.local</code>.
          </li>
          <li>
            Open{' '}
            <a
              href='https://supabase.com/dashboard/project/_/settings/api'
              className='text-gold-soft underline'
              target='_blank'
              rel='noreferrer'
            >
              Supabase → Project Settings → API
            </a>{' '}
            and paste <strong>Project URL</strong> into <code className='text-gold-soft'>NEXT_PUBLIC_SUPABASE_URL</code> and the{' '}
            <strong>anon public</strong> key into <code className='text-gold-soft'>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
          </li>
          <li>
            Add <code className='text-gold-soft'>SUPABASE_SERVICE_ROLE_KEY</code> (service role, server-only) for bookings, webhooks, and the contact form.
          </li>
          <li>Restart <code className='text-gold-soft'>npm run dev</code> so Next.js reloads environment variables.</li>
        </ol>
        <p className='mt-6 text-xs text-zinc-500'>
          Public pages stay online: <code className='text-zinc-400'>GET /api/services</code> returns empty packages with code{' '}
          <code className='text-zinc-400'>SUPABASE_NOT_READY</code> instead of a 500 when keys are missing.
        </p>
        <p className='mt-6 text-xs text-zinc-500'>
          Check the terminal where Next is running: missing keys are logged with the prefix <code className='text-zinc-400'>[Gloss Boss ATX / …]</code>.
        </p>
        <div className='mt-8 flex flex-wrap gap-3'>
          <Link href='/' className='rounded-lg bg-gold px-5 py-3 text-sm font-bold uppercase tracking-wider text-black'>
            Back to site
          </Link>
          <Link href='/login' className='rounded-lg border border-white/20 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white'>
            Login
          </Link>
        </div>
      </div>
    </main>
  );
}

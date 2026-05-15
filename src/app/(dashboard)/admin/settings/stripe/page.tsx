import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSettingsFlags } from '@/lib/stripe/stripeService';
import { submitStripeSettingsForm } from './stripe-settings-actions';

export const dynamic = 'force-dynamic';

export default async function AdminStripeSettingsPage() {
  const session = await getSessionWithProfile();

  if (!session.supabaseConfigured) {
    return (
      <DashboardShell title='Stripe setup' subtitle='Server configuration required.' role='admin'>
        <p className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100'>
          Add Supabase keys for full functionality. See <Link href='/setup' className='text-gold-soft underline'>setup</Link>.
        </p>
      </DashboardShell>
    );
  }

  const admin = tryCreateAdminSupabase();
  const flags = await getStripeSettingsFlags(admin);

  const envWins = flags.envHasSecret;
  const stripeConnected = envWins || flags.dbHasSecret;

  return (
    <DashboardShell
      title='Stripe setup'
      subtitle='Secrets are stored in Supabase settings (server-side only) or via Vercel env. Nothing sensitive is sent to the browser after save.'
      role='admin'
    >
      <div className='mt-6 space-y-4 rounded-2xl border border-gold/20 bg-zinc-950 p-5 text-sm text-zinc-300'>
        <p className='text-xs text-zinc-500'>
          Stripe mode:{' '}
          <span className='font-semibold text-gold-soft'>
            {flags.stripeMode === 'live' ? 'Live' : flags.stripeMode === 'test' ? 'Test' : flags.stripeMode === 'unknown' ? 'Unknown' : 'Not connected'}
          </span>
        </p>
        {!stripeConnected ? (
          <p className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>
            Stripe not connected yet — deposits and gift card checkout stay disabled until you add a secret key (environment variable or secure save below).
          </p>
        ) : null}
        <p>
          <span className='font-semibold text-gold-soft'>Webhook URL (Stripe Dashboard):</span>{' '}
          <code className='break-all rounded bg-black px-2 py-1 text-xs text-emerald-300'>
            {typeof process.env.NEXT_PUBLIC_APP_URL === 'string' ? `${process.env.NEXT_PUBLIC_APP_URL}/api/stripe/webhook` : 'Set NEXT_PUBLIC_APP_URL for the live webhook URL'}
          </code>
        </p>
        <p className='text-xs text-zinc-500'>
          Priority: <code className='text-zinc-400'>STRIPE_SECRET_KEY</code> in environment overrides database. Use one source in production to avoid confusion.
        </p>
        {envWins ? (
          <p className='rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200'>
            Environment variable <code>STRIPE_SECRET_KEY</code> is set — it overrides Supabase-stored keys for API calls.
          </p>
        ) : null}
        <ul className='grid gap-2 text-xs sm:grid-cols-3'>
          <li className='rounded border border-white/10 bg-black/40 px-3 py-2'>
            DB secret: {flags.dbHasSecret ? <span className='text-emerald-400'>saved</span> : <span className='text-zinc-500'>not set</span>}
          </li>
          <li className='rounded border border-white/10 bg-black/40 px-3 py-2'>
            Webhook secret: {flags.dbHasWebhook || flags.envHasWebhook ? <span className='text-emerald-400'>configured</span> : <span className='text-zinc-500'>not set</span>}
          </li>
          <li className='rounded border border-white/10 bg-black/40 px-3 py-2'>
            Publishable: {flags.dbHasPublishable || flags.envHasPublishable ? <span className='text-emerald-400'>configured</span> : <span className='text-zinc-500'>not set</span>}
          </li>
        </ul>

        {stripeConnected && flags.stripeMode === 'unknown' ? (
          <p className='rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100'>
            Stripe keys detected but mode could not be determined.
          </p>
        ) : null}

        {stripeConnected && !flags.envHasPublishable && !flags.dbHasPublishable ? (
          <p className='rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100'>
            Stripe publishable key missing.
            <br />
            Add <code className='text-gold-soft'>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> in Vercel environment variables.
          </p>
        ) : null}

        {stripeConnected && !flags.envHasWebhook && !flags.dbHasWebhook ? (
          <p className='rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100'>
            Stripe webhook not connected yet.
            <br />
            Add webhook endpoint after production domain is finalized.
          </p>
        ) : null}
      </div>

      <form action={submitStripeSettingsForm} className='mt-6 space-y-4 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-lg font-bold uppercase text-white'>Connect Stripe account</h2>
        <p className='text-xs text-zinc-500'>Paste keys once. Fields are password-masked. Leave blank to keep an existing stored value unchanged.</p>

        <label className='block text-xs text-zinc-400'>
          Secret key (sk_live_… or sk_test_…)
          <input
            name='secretKey'
            type='password'
            autoComplete='off'
            placeholder='••••••••'
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400'>
          Webhook signing secret (whsec_…)
          <input
            name='webhookSecret'
            type='password'
            autoComplete='off'
            placeholder='••••••••'
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400'>
          Publishable key (pk_live_… or pk_test_…) — optional for future Elements
          <input
            name='publishableKey'
            type='password'
            autoComplete='off'
            placeholder='••••••••'
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>

        <button type='submit' className='rounded-lg bg-gold px-5 py-3 text-xs font-black uppercase tracking-wider text-black'>
          Save securely
        </button>
      </form>

      <p className='mt-4 text-xs text-zinc-500'>
        Run migration <code className='text-zinc-400'>000003_settings.sql</code> if the settings table is missing.
      </p>

      <Link href='/admin' className='mt-6 inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
        ← Admin overview
      </Link>
    </DashboardShell>
  );
}

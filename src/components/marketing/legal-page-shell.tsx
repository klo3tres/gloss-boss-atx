import Link from 'next/link';
import { MarketingSiteFooter } from '@/components/marketing/marketing-site-footer';

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className='rounded-2xl border border-gold/20 bg-zinc-950/90 p-6 shadow-[0_0_32px_rgba(212,175,55,0.06)]'>
      <h2 className='text-base font-black uppercase tracking-[0.14em] text-gold-soft'>{title}</h2>
      <div className='mt-4 space-y-3 text-sm leading-relaxed text-zinc-300'>{children}</div>
    </section>
  );
}

export function LegalSectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <LegalSection title={title}>{children}</LegalSection>;
}

export function LegalPageShell({
  title,
  subtitle,
  lastUpdated,
  children,
}: {
  title: string;
  subtitle: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <main className='min-h-screen bg-black pb-8 pt-24 text-zinc-200'>
        <div className='mx-auto w-full max-w-3xl px-4 sm:px-6'>
          <Link href='/' className='text-xs font-bold uppercase tracking-wider text-gold-soft hover:text-white'>
            ← Back to home
          </Link>
          <p className='mt-6 text-xs font-bold uppercase tracking-[0.25em] text-gold-soft'>Legal</p>
          <h1 className='mt-2 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl'>{title}</h1>
          <p className='mt-3 text-sm text-zinc-400'>{subtitle}</p>
          <p className='mt-2 text-xs text-zinc-600'>Last updated: {lastUpdated}</p>

          <div className='mt-10 space-y-6'>{children}</div>

          <p className='mt-10 text-xs leading-relaxed text-zinc-500'>
            Questions about this policy? Contact us at{' '}
            <a href='mailto:info@glossbossatx.com' className='text-gold-soft underline'>
              info@glossbossatx.com
            </a>
            .
          </p>
        </div>
      </main>
      <MarketingSiteFooter compact />
    </>
  );
}

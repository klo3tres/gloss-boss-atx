import Link from 'next/link';
import { GLOSS_BOSS_SUPPORT_EMAIL, GLOSS_BOSS_SUPPORT_MAILTO } from '@/lib/branding';

export function MarketingSiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`border-t border-white/10 bg-black/80 ${compact ? 'mt-12 py-8' : 'py-12'} px-4 sm:px-6`}>
      <div className='mx-auto flex w-full max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <p className='text-xs font-bold uppercase tracking-[0.2em] text-gold-soft'>Gloss Boss ATX</p>
          <p className='mt-2 text-sm text-zinc-400'>
            Austin, Texas & surrounding areas ·{' '}
            <a href='tel:+15124812319' className='text-gold-soft hover:text-white'>
              (512) 481-2319
            </a>
            {' · '}
            <a href={GLOSS_BOSS_SUPPORT_MAILTO} className='text-gold-soft hover:text-white'>
              {GLOSS_BOSS_SUPPORT_EMAIL}
            </a>
          </p>
        </div>
        <nav className='flex flex-wrap gap-x-6 gap-y-2 text-xs font-bold uppercase tracking-wider' aria-label='Legal and site links'>
          <Link href='/privacy' className='text-zinc-400 transition hover:text-gold-soft'>
            Privacy Policy
          </Link>
          <Link href='/terms' className='text-zinc-400 transition hover:text-gold-soft'>
            Terms &amp; Conditions
          </Link>
          <Link href='/book' className='text-gold-soft transition hover:text-white'>
            Book
          </Link>
          <Link href='/' className='text-zinc-400 transition hover:text-gold-soft'>
            Home
          </Link>
        </nav>
      </div>
      <p className='mx-auto mt-6 max-w-7xl text-center text-[10px] text-zinc-600 sm:text-left'>
        © {new Date().getFullYear()} Gloss Boss ATX. All rights reserved.
      </p>
    </footer>
  );
}

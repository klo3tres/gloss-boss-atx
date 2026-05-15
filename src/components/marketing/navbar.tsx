'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearAuthUxSession } from '@/lib/auth/auth-session-ux';
import { defaultDashboardPathForRole } from '@/lib/auth/resolve-post-login-path';
import { fetchUserRole } from '@/lib/auth/fetchUserRole';
import { createSupabaseBrowserClient, isSupabasePublicReady } from '@/lib/supabase/client';

const marketingLinks = [
  { href: '/', label: 'Home' },
  { href: '/services', label: 'Services' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/book', label: 'Book' },
  { href: '#about', label: 'About' },
  { href: '/gift-cards', label: 'Gift Cards' },
  { href: '#faq', label: 'FAQ' },
  { href: '#contact', label: 'Contact' },
];

function isDashboardPath(pathname: string): boolean {
  return ['/dashboard', '/admin', '/tech', '/customer'].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [dashboardHref, setDashboardHref] = useState('/login');

  const isDash = isDashboardPath(pathname);

  const toSectionLink = (section: string) => {
    if (section.startsWith('/')) return section;
    return pathname === '/' ? section : `/${section}`;
  };

  useEffect(() => {
    if (!isSupabasePublicReady()) {
      setSignedIn(false);
      setDashboardHref('/login');
      return;
    }
    const client = createSupabaseBrowserClient();
    if (!client) {
      setSignedIn(false);
      setDashboardHref('/login');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const {
          data: { user },
        } = await client.auth.getUser();
        if (cancelled) return;
        if (!user) {
          setSignedIn(false);
          setDashboardHref('/login');
          return;
        }
        const outcome = await fetchUserRole(client);
        if (cancelled) return;
        setSignedIn(true);
        if (outcome.ok) {
          setDashboardHref(defaultDashboardPathForRole(outcome.role));
        } else {
          setDashboardHref('/login');
        }
      } catch (e) {
        console.warn('[Navbar] session/role refresh failed', e);
        if (!cancelled) {
          setSignedIn(false);
          setDashboardHref('/login');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const handleLogout = async () => {
    setOpen(false);
    if (!isSupabasePublicReady()) {
      router.push('/login');
      return;
    }
    const client = createSupabaseBrowserClient();
    if (client) {
      clearAuthUxSession();
      await client.auth.signOut();
    }
    setSignedIn(false);
    setDashboardHref('/login');
    router.push('/login');
    router.refresh();
  };

  const coreLinks = (
    <div className='flex flex-wrap items-center gap-3 sm:gap-4'>
      <Link href='/' className='text-xs font-bold uppercase tracking-wider text-zinc-300 hover:text-gold-soft'>
        Home
      </Link>
      <Link href='/book' className='text-xs font-bold uppercase tracking-wider text-zinc-300 hover:text-gold-soft'>
        Book
      </Link>
      {signedIn ? (
        <>
          <Link href={dashboardHref} className='text-xs font-bold uppercase tracking-wider text-gold-soft hover:underline'>
            Dashboard
          </Link>
          <button
            type='button'
            onClick={() => void handleLogout()}
            className='text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white'
          >
            Logout
          </button>
        </>
      ) : (
        <Link href='/login' className='text-xs font-bold uppercase tracking-wider text-gold-soft hover:underline'>
          Login
        </Link>
      )}
    </div>
  );

  return (
    <header className='sticky top-0 z-50 border-b border-white/10 bg-black/90 backdrop-blur-xl'>
      <nav className='mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4'>
        <div className='flex items-center justify-between gap-3'>
          <Link href='/' className='group inline-flex min-w-0 items-center gap-3' onClick={() => setOpen(false)}>
            <Image
              src='/brand/glossboss-atx-alt-logo.png'
              alt='Gloss Boss ATX'
              width={126}
              height={38}
              className='h-8 w-auto shrink-0 sm:h-9'
              priority
            />
            <span className='hidden text-[11px] font-bold uppercase tracking-[0.16em] text-gold-soft/90 sm:inline sm:text-xs'>Premium Auto Care</span>
          </Link>

          <div className='hidden items-center gap-6 md:flex md:flex-1 md:justify-end lg:gap-8'>
            {coreLinks}
            {!isDash ? (
              <div className='ml-4 flex flex-wrap items-center gap-4 border-l border-white/10 pl-6'>
                {marketingLinks
                  .filter((l) => l.href !== '/' && l.href !== '/book')
                  .map((item) => (
                    <a key={item.label} href={toSectionLink(item.href)} className='text-sm uppercase tracking-widest text-zinc-300 transition hover:text-gold-soft'>
                      {item.label}
                    </a>
                  ))}
              </div>
            ) : null}
          </div>

          <button
            type='button'
            onClick={() => setOpen((v) => !v)}
            className='rounded-md border border-gold/20 p-2 text-gold-soft md:hidden'
            aria-label='Toggle menu'
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <div className='flex md:hidden'>{coreLinks}</div>

        {open ? (
          <div className='border-t border-white/10 py-4 md:hidden'>
            <div className='flex flex-col gap-3'>
              {!isDash
                ? marketingLinks.map((item) => (
                    <a
                      key={item.label}
                      href={toSectionLink(item.href)}
                      onClick={() => setOpen(false)}
                      className='text-sm uppercase tracking-widest text-zinc-300'
                    >
                      {item.label}
                    </a>
                  ))
                : null}
            </div>
          </div>
        ) : null}
      </nav>
    </header>
  );
}

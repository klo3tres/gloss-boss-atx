'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Menu, X, ChevronDown } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearAuthUxSession } from '@/lib/auth/auth-session-ux';
import { defaultDashboardPathForRole } from '@/lib/auth/resolve-post-login-path';
import { fetchUserRole } from '@/lib/auth/fetchUserRole';
import { createSupabaseBrowserClient, isSupabasePublicReady } from '@/lib/supabase/client';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

const DEFAULT_NAV_LOGO = '/brand/glossboss-official-atx.png';

const publicNavLinks = [
  { href: '/', label: 'Home' },
  { href: '/services', label: 'Services' },
  { href: '/memberships', label: 'Memberships' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/book', label: 'Book Now' },
];

const moreNavLinks = [
  { href: '/fleet', label: 'Fleet' },
  { href: '/about', label: 'About' },
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
  const [userRole, setUserRole] = useState<string | null>(null);
  const [dashboardHref, setDashboardHref] = useState('/login');
  const [navLogoSrc, setNavLogoSrc] = useState(DEFAULT_NAV_LOGO);
  const [moreOpen, setMoreOpen] = useState(false);

  const isDash = isDashboardPath(pathname);

  const toSectionLink = (section: string) => {
    if (section.startsWith('/')) return section;
    return pathname === '/' ? section : `/${section}`;
  };

  const dropdownMarketingLinks = moreNavLinks;
  const dashboardLabel = userRole === 'customer' ? 'Portal' : 'Dashboard';

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    void fetchWithTimeout('/api/public/site-settings', { cache: 'no-store', timeoutMs: 8000 })
      .then(async (r) => {
        try {
          return (await r.json()) as { navbarLogo?: string | null };
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (cancelled || !data?.navbarLogo) return;
        setNavLogoSrc(data.navbarLogo);
      })
      .catch(() => {
        /* keep default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          setUserRole(null);
          setDashboardHref('/login');
          return;
        }
        const outcome = await fetchUserRole(client);
        if (cancelled) return;
        setSignedIn(true);
        if (outcome.ok) {
          setUserRole(outcome.role);
          setDashboardHref(defaultDashboardPathForRole(outcome.role));
        } else {
          setUserRole(null);
          setDashboardHref('/login');
        }
      } catch (e) {
        console.warn('[Navbar] session/role refresh failed', e);
        if (!cancelled) {
          try {
            const {
              data: { user },
            } = await client.auth.getUser();
            if (user) {
              const outcome = await fetchUserRole(client);
              setSignedIn(true);
              setUserRole(outcome.ok ? outcome.role : 'customer');
              setDashboardHref(
                outcome.ok ? defaultDashboardPathForRole(outcome.role) : defaultDashboardPathForRole('customer'),
              );
              return;
            }
          } catch {
            /* fall through */
          }
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
    setUserRole(null);
    setDashboardHref('/login');
    router.push('/login');
    router.refresh();
  };

  const coreLinks = (
    <div className='flex flex-wrap items-center gap-3 sm:gap-4'>
      {publicNavLinks.map((item) => (
        <Link
          key={item.href}
          href={item.href.startsWith('#') ? toSectionLink(item.href) : item.href}
          className='text-xs font-bold uppercase tracking-wider text-zinc-300 hover:text-gold-soft'
        >
          {item.label === 'Book Now' ? 'Book' : item.label}
        </Link>
      ))}
      {signedIn ? (
        <>
          <Link
            href={dashboardHref}
            className='gb-premium-btn inline-flex items-center rounded-xl bg-gradient-to-r from-gold to-gold-soft px-3.5 py-2 text-[10px] font-black uppercase tracking-wider text-black shadow-[0_0_16px_rgba(212,175,55,0.2)] hover:brightness-110'
          >
            {dashboardLabel}
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
          Sign In
        </Link>
      )}
    </div>
  );

  return (
    <header className='gb-no-print gb-luxury-nav sticky top-0 z-[60]'>
      <nav className='mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4'>
        <div className='flex items-center justify-between gap-3'>
          <Link href='/' className='group inline-flex min-w-0 items-center gap-3' onClick={() => setOpen(false)}>
            <Image
              src={navLogoSrc}
              alt='Gloss Boss ATX'
              width={240}
              height={68}
              unoptimized={navLogoSrc.startsWith('http')}
              className='h-14 w-auto max-h-16 max-w-[min(240px,50vw)] shrink-0 object-contain object-left sm:h-16'
              priority
            />
            <span className='hidden text-[11px] font-bold uppercase tracking-[0.16em] text-gold-soft/90 sm:inline sm:text-xs'>Premium Auto Care</span>
          </Link>

          <div className='hidden items-center gap-6 md:flex md:flex-1 md:justify-end lg:gap-8'>
            {coreLinks}
            {!isDash ? (
              <Link
                href='/book'
                className='gb-premium-btn ml-2 inline-flex items-center rounded-xl bg-gradient-to-r from-gold to-gold-soft px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-black shadow-[0_0_20px_rgba(212,175,55,0.25)] hover:brightness-110'
              >
                Book now
              </Link>
            ) : null}
            {!isDash ? (
              <div className='ml-4 border-l border-white/10 pl-6 text-xs uppercase tracking-widest text-zinc-300'>
                <div className='relative' onMouseLeave={() => setMoreOpen(false)}>
                  <button
                    type='button'
                    onClick={() => setMoreOpen(!moreOpen)}
                    onMouseEnter={() => setMoreOpen(true)}
                    className='flex items-center gap-1 transition hover:text-gold-soft uppercase font-bold text-xs tracking-widest py-2'
                  >
                    More <ChevronDown size={14} />
                  </button>
                  {moreOpen && (
                    <div className='absolute right-0 top-full pt-1 w-48 z-50' onMouseEnter={() => setMoreOpen(true)}>
                      <div className='rounded-xl border border-gold/20 bg-zinc-950 p-2 shadow-2xl flex flex-col gap-1'>
                        {dropdownMarketingLinks.map((item) => (
                          <a
                            key={item.label}
                            href={toSectionLink(item.href)}
                            onClick={() => setMoreOpen(false)}
                            className='block rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:bg-gold/10 hover:text-gold-soft transition text-left'
                          >
                            {item.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
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

        {open ? (
          <>
            <button
              type='button'
              aria-label='Close menu'
              className='fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm md:hidden'
              onClick={() => setOpen(false)}
            />
            <div className='fixed inset-x-0 top-0 z-[80] max-h-[100dvh] overflow-y-auto border-b border-gold/20 bg-zinc-950 py-4 shadow-2xl md:hidden'>
              <div className='mx-auto flex max-w-7xl items-center justify-between px-4 pb-4 border-b border-white/10'>
                <span className='text-xs font-black uppercase tracking-widest text-gold-soft'>Menu</span>
                <button
                  type='button'
                  onClick={() => setOpen(false)}
                  className='rounded-md border border-gold/20 p-2 text-gold-soft'
                  aria-label='Close menu'
                >
                  <X size={18} />
                </button>
              </div>
              <div className='mx-auto max-w-7xl px-4 pt-4 flex flex-col gap-4'>
            {/* Core Links */}
            <div className='flex flex-col gap-3 pb-3 border-b border-white/5'>
              {publicNavLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href.startsWith('#') ? toSectionLink(item.href) : item.href}
                  onClick={() => setOpen(false)}
                  className='text-sm font-bold uppercase tracking-wider text-zinc-300 hover:text-gold-soft'
                >
                  {item.label}
                </Link>
              ))}
              {signedIn ? (
                <>
                  <Link
                    href={dashboardHref}
                    onClick={() => setOpen(false)}
                    className='gb-premium-btn inline-flex w-fit items-center rounded-xl bg-gradient-to-r from-gold to-gold-soft px-4 py-2.5 text-xs font-black uppercase tracking-wider text-black'
                  >
                    {dashboardLabel}
                  </Link>
                  <button
                    type='button'
                    onClick={() => {
                      void handleLogout();
                    }}
                    className='text-sm font-bold uppercase tracking-wider text-zinc-400 hover:text-white text-left'
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link href='/login' onClick={() => setOpen(false)} className='text-sm font-bold uppercase tracking-wider text-gold-soft hover:underline'>
                  Sign In
                </Link>
              )}
            </div>

            {/* More links */}
            <div className='flex flex-col gap-3 pb-6'>
              {!isDash
                ? dropdownMarketingLinks.map((item) => (
                    <a
                      key={item.label}
                      href={toSectionLink(item.href)}
                      onClick={() => setOpen(false)}
                      className='text-sm uppercase tracking-widest text-zinc-400 hover:text-gold-soft'
                    >
                      {item.label}
                    </a>
                  ))
                : null}
            </div>
              </div>
            </div>
          </>
        ) : null}
      </nav>
    </header>
  );
}

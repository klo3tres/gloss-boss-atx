'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/marketing/navbar';

const INTERNAL_PREFIXES = ['/admin', '/tech', '/dashboard', '/customer', '/login', '/signup', '/forgot-password'];

function isInternalRoute(pathname: string) {
  return INTERNAL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const internal = isInternalRoute(pathname);

  return (
    <>
      {!internal ? <Navbar /> : null}
      {children}
    </>
  );
}

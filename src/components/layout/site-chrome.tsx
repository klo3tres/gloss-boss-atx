'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/marketing/navbar';

/**
 * Global chrome: marketing + dashboard routes all get the persistent top nav (`Navbar`).
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}

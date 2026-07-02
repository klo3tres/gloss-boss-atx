'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Shield, Wrench, User, Zap } from 'lucide-react';
import type { DashboardShellRole } from '@/components/dashboard/dashboard-shell';

function isNavActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/admin') {
    return pathname === '/admin' || (pathname.startsWith('/admin/') && !pathname.startsWith('/admin/titan'));
  }
  if (href.startsWith('/admin/titan')) {
    return pathname === '/admin/titan' || pathname.startsWith('/admin/titan/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

const LINKS: { href: string; label: string; icon: typeof Home; roles: DashboardShellRole[] }[] = [
  { href: '/', label: 'Home', icon: Home, roles: ['super_admin', 'admin', 'technician', 'customer'] },
  { href: '/admin', label: 'Admin', icon: Shield, roles: ['super_admin', 'admin'] },
  { href: '/admin/titan?workspace=growth', label: 'Titan', icon: Zap, roles: ['super_admin', 'admin'] },
  { href: '/tech', label: 'Tech', icon: Wrench, roles: ['super_admin', 'admin', 'technician'] },
  { href: '/dashboard', label: 'Customer', icon: User, roles: ['super_admin', 'admin', 'technician', 'customer'] },
];

export function GlobalAppNav({ role, overlayActive }: { role: DashboardShellRole; overlayActive?: boolean }) {
  const pathname = usePathname();

  const visible = LINKS.filter((l) => l.roles.includes(role));

  return (
    <nav
      className={`gb-no-print sticky top-0 -mx-4 mb-4 border-b border-white/10 bg-black/90 px-4 py-2 backdrop-blur-md transition-[z-index,opacity] sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:mb-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 ${
        overlayActive ? 'pointer-events-none z-30 opacity-0 lg:pointer-events-auto lg:opacity-100' : 'z-[60]'
      }`}
      aria-label="Global navigation"
      aria-hidden={overlayActive || undefined}
    >
      <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map(({ href, label, icon: Icon }) => {
          const active = isNavActive(pathname, href);
          const resolvedHref =
            label === 'Customer' && (role === 'admin' || role === 'super_admin' || role === 'technician')
              ? '/dashboard?preview=customer'
              : href;
          return (
            <Link
              key={href}
              href={resolvedHref}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wide transition ${
                active
                  ? 'border-gold/40 bg-gold/10 text-gold-soft'
                  : 'border-white/8 text-zinc-400 hover:border-gold/25 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

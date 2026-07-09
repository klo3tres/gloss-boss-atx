'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Rocket,
  Plug,
  Settings,
  Target,
  Users,
  FolderKanban,
  Zap,
  Key,
  ExternalLink,
} from 'lucide-react';
import type { BusinessRecord } from '@/lib/titan/business-context';

const NAV = [
  { href: '/titan', label: 'Home', icon: LayoutDashboard },
  { href: '/titan/actions', label: 'Actions', icon: Zap },
  { href: '/titan/opportunities', label: 'Opportunities', icon: Target },
  { href: '/titan/customers', label: 'Customers', icon: Users },
  { href: '/titan/projects', label: 'Projects', icon: FolderKanban },
  { href: '/titan/connect', label: 'Integrations', icon: Plug },
  { href: '/titan/api-keys', label: 'API keys', icon: Key },
  { href: '/titan/settings', label: 'Settings', icon: Settings },
  { href: '/titan/start', label: 'Onboarding', icon: Rocket },
];

export function TitanPlatformShell({
  business,
  children,
}: {
  business: BusinessRecord;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#070708] text-zinc-100">
      <header className="border-b border-white/8 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-400/90">Titan OS</p>
            <h1 className="text-lg font-black text-white">{business.name}</h1>
            <p className="text-xs text-zinc-500">AI business operating system · {business.industry.replace(/_/g, ' ')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {business.isPlatformTenant ? (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1 rounded-xl border border-white/15 px-3 py-2 text-[10px] font-black uppercase text-zinc-300 hover:border-amber-500/30"
              >
                Gloss Boss admin <ExternalLink className="h-3 w-3" />
              </Link>
            ) : null}
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase text-emerald-300">
              {business.status}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[220px_1fr] sm:px-6">
        <nav className="flex flex-row gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/titan' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition ${
                  active
                    ? 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/25'
                    : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

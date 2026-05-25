'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { DashboardAuthDebugFooter } from '@/components/dashboard/dashboard-auth-debug-footer';
import { SafeRenderBoundary } from '@/components/ui/safe-render-boundary';

export const GB_NAV_SIM_KEY = 'gb_nav_sim_role';
export const GB_NAV_SIM_EVENT = 'gb_nav_sim_change';

export type DashboardShellRole = 'super_admin' | 'admin' | 'technician' | 'customer';

const adminLinks = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/payments', label: 'Payments / Receipts' },
  { href: '/admin/receipts', label: 'Receipts' },
  { href: '/admin/work-orders', label: 'Work Orders' },
  { href: '/admin/dispatch', label: 'Dispatch' },
  { href: '/admin/leads', label: 'Leads' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/agreements', label: 'Agreements & intake' },
  { href: '/admin/qa-checklist', label: 'QA checklist' },
  { href: '/admin/operations', label: 'Operations' },
  { href: '/admin/booking-health', label: 'Booking health' },
  { href: '/admin/team', label: 'Team' },
  { href: '/admin/messages', label: 'Message center' },
  { href: '/admin/notifications', label: 'Notifications' },
  { href: '/admin/integrations', label: 'Integrations' },
  { href: '/admin/services', label: 'Services & pricing' },
  { href: '/admin/addons', label: 'Booking add-ons' },
  { href: '/admin/promotions', label: 'Promotions' },
  { href: '/admin/pricing', label: 'Deals & promos' },
  { href: '/admin/cms', label: 'Website CMS' },
  { href: '/admin/settings/stripe', label: 'Stripe' },
  { href: '/admin/system-status', label: 'System status' },
];

const superLinks = [
  { href: '/admin/super', label: 'Command center' },
  { href: '/admin/booking-health', label: 'Booking health' },
  { href: '/admin', label: 'Operations (admin)' },
  { href: '/admin/payments', label: 'Payments / Receipts' },
  { href: '/admin/receipts', label: 'Receipts' },
  { href: '/admin/work-orders', label: 'Work Orders' },
  { href: '/admin/dispatch', label: 'Dispatch' },
  { href: '/admin/leads', label: 'Leads' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/agreements', label: 'Agreements & intake' },
  { href: '/admin/qa-checklist', label: 'QA checklist' },
  { href: '/admin/operations', label: 'Operations' },
  { href: '/admin/team', label: 'Team' },
  { href: '/admin/messages', label: 'Message center' },
  { href: '/admin/notifications', label: 'Notifications' },
  { href: '/admin/integrations', label: 'Integrations' },
  { href: '/admin/services', label: 'Services & pricing' },
  { href: '/admin/addons', label: 'Booking add-ons' },
  { href: '/admin/promotions', label: 'Promotions' },
  { href: '/admin/pricing', label: 'Deals & promos' },
  { href: '/admin/cms', label: 'Website & gallery CMS' },
  { href: '/admin/settings/stripe', label: 'Stripe & billing' },
  { href: '/admin/system-status', label: 'System status' },
];

const techLinks = [
  { href: '/tech', label: 'Active work orders' },
  { href: '/tech/workflow', label: 'Walk-in workflow' },
  { href: '/tech#field-invoice', label: 'Field tools' },
  { href: '/tech/resources', label: 'SOPs' },
];

const customerLinks = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/messages', label: 'Messages' },
  { href: '/book', label: 'Book again' },
  { href: '/gift-cards', label: 'Gift cards' },
  { href: '/services', label: 'Services' },
];

export function DashboardShell({
  title,
  subtitle,
  role,
  children,
}: {
  title: string;
  subtitle: string;
  role: DashboardShellRole;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [simNav, setSimNav] = useState<DashboardShellRole | null>(null);

  useEffect(() => {
    const read = () => {
      if (role !== 'super_admin') {
        setSimNav(null);
        return;
      }
      try {
        const raw = sessionStorage.getItem(GB_NAV_SIM_KEY)?.trim();
        const allowed: DashboardShellRole[] = ['super_admin', 'admin', 'technician', 'customer'];
        if (raw && (allowed as string[]).includes(raw)) setSimNav(raw as DashboardShellRole);
        else setSimNav(null);
      } catch {
        setSimNav(null);
      }
    };
    read();
    window.addEventListener(GB_NAV_SIM_EVENT, read);
    return () => window.removeEventListener(GB_NAV_SIM_EVENT, read);
  }, [role]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const navRole: DashboardShellRole = role === 'super_admin' && simNav ? simNav : role;

  const links =
    navRole === 'super_admin'
      ? superLinks
      : navRole === 'admin'
        ? adminLinks
        : navRole === 'technician'
          ? techLinks
          : customerLinks;

  const panelLabel: Record<DashboardShellRole, string> = {
    super_admin: 'Super admin',
    admin: 'Admin',
    technician: 'Technician',
    customer: 'Customer',
  };

  const panelTitle =
    role === 'super_admin' && simNav && simNav !== 'super_admin'
      ? `${panelLabel[simNav]} view (simulated)`
      : `${panelLabel[role]} panel`;

  const NavLinks = (
    <nav className='mt-6 space-y-2'>
      {links.map((link) => (
        <Link
          key={`${link.href}-${link.label}`}
          href={link.href}
          className={`block rounded-lg border px-3 py-2 text-sm transition ${
            pathname === link.href || pathname.startsWith(`${link.href}/`)
              ? 'border-gold/50 bg-gold/10 text-gold-soft'
              : 'border-transparent text-zinc-300 hover:border-gold/30 hover:bg-black/40 hover:text-gold-soft'
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <main className='min-h-screen bg-background text-foreground'>
      <div className='gb-no-print pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,166,77,0.10),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.08),transparent_30%)]' aria-hidden />
      <div className='relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:py-8'>
        <div className='gb-no-print flex items-center justify-between lg:hidden'>
          <p className='text-xs font-bold uppercase tracking-widest text-gold-soft'>Menu</p>
          <button
            type='button'
            onClick={() => setNavOpen((v) => !v)}
            className='rounded-lg border border-gold/30 p-2 text-gold-soft'
            aria-expanded={navOpen}
            aria-label='Toggle navigation'
          >
            {navOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {navOpen ? (
          <div className='gb-no-print fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden' onClick={() => setNavOpen(false)} aria-hidden />
        ) : null}

        <aside
          className={`gb-no-print order-2 z-50 rounded-3xl border border-gold/25 bg-gradient-to-b from-zinc-950/95 via-black/95 to-zinc-950/95 p-5 shadow-[0_0_42px_rgba(212,166,77,0.10)] backdrop-blur lg:sticky lg:top-6 lg:order-1 lg:block lg:max-w-[280px] lg:shrink-0 ${
            navOpen ? 'fixed left-4 right-4 top-20 max-h-[80vh] overflow-y-auto shadow-2xl lg:relative lg:left-auto lg:right-auto lg:top-auto lg:max-h-none' : 'hidden lg:block'
          }`}
        >
          <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Gloss Boss ATX</p>
          <h2 className='mt-3 text-lg font-black uppercase'>{panelTitle}</h2>
          {NavLinks}
        </aside>

        <section className='order-1 min-w-0 flex-1 space-y-8 lg:order-2'>
          <header className='gb-no-print overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-br from-zinc-950 via-black to-zinc-950 p-5 shadow-[0_0_40px_rgba(212,166,77,0.10)]'>
            <div className='pointer-events-none float-right h-20 w-20 rounded-full bg-gold/10 blur-2xl' aria-hidden />
            <h1 className='text-2xl font-black uppercase sm:text-3xl'>{title}</h1>
            <p className='mt-2 text-sm text-zinc-300'>{subtitle}</p>
          </header>
          <SafeRenderBoundary label='Dashboard content'>{children}</SafeRenderBoundary>
          <div className='gb-no-print'>
            <DashboardAuthDebugFooter />
          </div>
        </section>
      </div>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X, Bell, ShieldAlert, Sparkles, MessageSquare } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { DashboardAuthDebugFooter } from '@/components/dashboard/dashboard-auth-debug-footer';
import { SafeRenderBoundary } from '@/components/ui/safe-render-boundary';

export const GB_NAV_SIM_KEY = 'gb_nav_sim_role';
export const GB_NAV_SIM_EVENT = 'gb_nav_sim_change';

export type DashboardShellRole = 'super_admin' | 'admin' | 'technician' | 'customer';

type NavLink = { href: string; label: string };
type NavGroup = { title: string; links: NavLink[] };

const adminNavGroups: NavGroup[] = [
  {
    title: 'Overview',
    links: [
      { href: '/admin', label: 'Dashboard' },
      { href: '/admin/assistant', label: 'AI assistant' },
      { href: '/admin/booking-health', label: 'Booking health' },
      { href: '/admin/qa-checklist', label: 'QA checklist' },
    ],
  },
  {
    title: 'Work',
    links: [
      { href: '/admin/work-orders', label: 'Work orders' },
      { href: '/admin/dispatch', label: 'Dispatch' },
      { href: '/admin/leads', label: 'Leads' },
      { href: '/admin/agreements', label: 'Agreements & intake' },
    ],
  },
  {
    title: 'Customers',
    links: [
      { href: '/admin/customers', label: 'Customers' },
      { href: '/admin/messages', label: 'Message center' },
    ],
  },
  {
    title: 'Finance',
    links: [
      { href: '/admin/revenue', label: 'Revenue' },
      { href: '/admin/reports', label: 'Reports' },
      { href: '/admin/payments', label: 'Payments / receipts' },
      { href: '/admin/card-activity', label: 'Card activity' },
      { href: '/admin/receipts', label: 'Receipts' },
      { href: '/admin/gift-cards', label: 'Gift cards' },
      { href: '/admin/goals', label: 'Goals' },
    ],
  },
  {
    title: 'Marketing',
    links: [
      { href: '/admin/cms', label: 'Website & gallery' },
      { href: '/admin/promotions', label: 'Promotions' },
      { href: '/admin/pricing', label: 'Deals & promos' },
    ],
  },
  {
    title: 'Operations',
    links: [
      { href: '/admin/operations', label: 'Operations & mileage' },
      { href: '/admin/supply-requests', label: 'Supply requests' },
      { href: '/admin/fleet', label: 'Fleet accounts' },
      { href: '/admin/team', label: 'Team' },
      { href: '/admin/services', label: 'Services & pricing' },
      { href: '/admin/addons', label: 'Booking add-ons' },
      { href: '/admin/memberships', label: 'Memberships & loyalty' },
    ],
  },
  {
    title: 'System',
    links: [
      { href: '/admin/notifications', label: 'Notifications' },
      { href: '/admin/integrations', label: 'Integrations' },
      { href: '/admin/settings/stripe', label: 'Stripe' },
      { href: '/admin/stripe-sync', label: 'Stripe sync' },
      { href: '/admin/system-diagnostics', label: 'System diagnostics' },
      { href: '/admin/system-status', label: 'System status' },
    ],
  },
];

const adminLinks = adminNavGroups.flatMap((g) => g.links);

const superNavGroups: NavGroup[] = adminNavGroups;

const techLinks = [
  { href: '/tech?tab=overview', label: 'Overview' },
  { href: '/tech?tab=jobs', label: 'Assigned Jobs' },
  { href: '/tech?tab=active', label: 'Active Job' },
  { href: '/tech?tab=routes', label: 'Routes & Directions' },
  { href: '/tech?tab=leads', label: 'Leads & CRM' },
  { href: '/tech?tab=mileage', label: 'Gas & Mileage Log' },
  { href: '/tech?tab=supplies', label: 'Supply Requests' },
  { href: '/tech?tab=tools', label: 'Field Invoicing' },
  { href: '/tech/resources', label: 'SOPs' },
];

const customerLinks = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/messages', label: 'Messages' },
  { href: '/book', label: 'Book Again' },
  { href: '/gift-cards', label: 'Gift Cards' },
  { href: '/services', label: 'Services' },
  { href: '/dashboard/settings', label: 'Settings' },
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
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');
  const [navOpen, setNavOpen] = useState(false);
  const [simNav, setSimNav] = useState<DashboardShellRole | null>(null);
  const [currentHash, setCurrentHash] = useState('');

  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [outboxEvents, setOutboxEvents] = useState<any[]>([]);
  const [systemAlerts, setSystemAlerts] = useState<string[]>([]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    const loadNotifications = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'new');
        setUnreadCount(count ?? 0);

        const { data: events } = await supabase
          .from('job_timeline_events')
          .select('event_type, created_at, appointment_id')
          .order('created_at', { ascending: false })
          .limit(5);
        if (events) {
          setRecentEvents(events);
        }

        const { data: outbox } = await supabase
          .from('notification_outbox')
          .select('id, kind, template_key, status, channel, created_at, appointment_id, error_message, payload')
          .order('created_at', { ascending: false })
          .limit(10);
        if (outbox) {
          setOutboxEvents(outbox);
        }

        const alertsList: string[] = [];
        const { count: unassignedCount } = await supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .is('assigned_technician_id', null)
          .in('status', ['assigned', 'confirmed']);
        if (unassignedCount && unassignedCount > 0) {
          alertsList.push(`${unassignedCount} unassigned jobs need attention`);
        }

        setSystemAlerts(alertsList);
      } catch (err) {
        console.warn('[Notifications Bell] error fetching data', err);
      }
    };

    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setCurrentHash(window.location.hash);
    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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
      ? superNavGroups.flatMap((g) => g.links)
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

  const linkClass = (href: string) => {
    const [pathAndQuery, hashPart] = href.split('#');
    const [pathPart, queryPart] = pathAndQuery.split('?');
    const hasHash = Boolean(hashPart);
    const hasQuery = Boolean(queryPart);
    
    let isActive = false;
    
    if (hasHash) {
      isActive = pathname === pathPart && currentHash === `#${hashPart}`;
    } else if (hasQuery) {
      const urlParams = new URLSearchParams(queryPart);
      const urlTab = urlParams.get('tab');
      isActive = pathname === pathPart && (currentTab === urlTab || (!currentTab && urlTab === 'overview'));
    } else {
      isActive =
        pathname === href ||
        (href !== '/dashboard' && href !== '/admin' && href !== '/tech' && pathname.startsWith(`${href}/`));
    }
    return `block rounded-lg border px-3 py-2 text-sm transition ${
      isActive
        ? 'border-gold/50 bg-gold/10 text-gold-soft shadow-[0_0_15px_rgba(212,175,55,0.15)]'
        : 'border-transparent text-zinc-300 hover:border-gold/30 hover:bg-black/40 hover:text-gold-soft'
    }`;
  };

  const NavLinks =
    navRole === 'admin' || navRole === 'super_admin' ? (
      <nav className='mt-6 space-y-5'>
        {(navRole === 'super_admin' ? superNavGroups : adminNavGroups).map((group) => (
          <div key={group.title}>
            <p className='px-1 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600'>{group.title}</p>
            <div className='mt-2 space-y-1'>
              {group.links.map((link) => (
                <Link key={`${link.href}-${link.label}`} href={link.href} className={linkClass(link.href)}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
        {navRole === 'super_admin' ? (
          <div>
            <p className='px-1 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600'>Command</p>
            <div className='mt-2 space-y-1'>
              <Link href='/admin/super' className={linkClass('/admin/super')}>
                Command center
              </Link>
            </div>
          </div>
        ) : null}
      </nav>
    ) : (
      <nav className='mt-6 space-y-2'>
        {links.map((link) => (
          <Link key={`${link.href}-${link.label}`} href={link.href} className={linkClass(link.href)}>
            {link.label}
          </Link>
        ))}
      </nav>
    );

  const hasAlertActivity =
    unreadCount > 0 ||
    systemAlerts.length > 0 ||
    outboxEvents.some((evt) => ['failed', 'error'].includes(String(evt.status ?? '').toLowerCase()));

  const platformPulse = [
    { label: 'Daily closeout', value: role === 'technician' ? 'Field checklist' : 'Closeout review', pct: 78 },
    { label: 'Response SLA', value: `${Math.max(0, unreadCount)} open`, pct: unreadCount > 0 ? 46 : 94 },
    { label: 'Quality streak', value: 'Elite tier', pct: 86 },
  ];

  return (
    <main className='gb-luxury-page min-h-screen bg-background text-foreground'>
      <div className='gb-no-print pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,166,77,0.10),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.08),transparent_30%)]' aria-hidden />
      <div className='relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:py-8'>
        <div className='gb-no-print flex items-center justify-between lg:hidden w-full bg-zinc-950/85 border border-gold/15 rounded-2xl px-4 py-2.5 mb-2 backdrop-blur-md shadow-[0_0_15px_rgba(212,175,55,0.08)]'>
          <div className="flex items-center gap-2">
            <img src="/brand/glossboss-clean-logo.png" alt="Gloss Boss ATX" className="h-7 w-auto object-contain filter brightness-110" />
            <span className='text-[10px] font-black uppercase tracking-[0.15em] text-gold-soft'>Gloss Boss ATX</span>
          </div>
          <button
            type='button'
            onClick={() => setNavOpen((v) => !v)}
            className='rounded-lg border border-gold/30 p-2 text-gold-soft hover:bg-gold/10 transition'
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
          <div className="flex flex-col items-center mb-5 border-b border-white/5 pb-4">
            <img src="/brand/glossboss-clean-logo.png" alt="Gloss Boss ATX" className="h-16 w-auto object-contain filter brightness-110 mb-2" />
            <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>Gloss Boss ATX</p>
          </div>
          <h2 className='text-base font-black uppercase text-center text-white mb-2'>{panelTitle}</h2>
          {NavLinks}
        </aside>

        <section className='order-1 min-w-0 flex-1 space-y-8 lg:order-2'>
          <header className='gb-premium-hero gb-no-print overflow-hidden rounded-3xl p-5 sm:p-6 flex items-center justify-between gap-4'>
            <div className="min-w-0 flex-1 flex items-center gap-4">
              <img src="/brand/glossboss-clean-logo.png" alt="Logo" className="h-12 w-auto object-contain filter brightness-110 hidden md:block" />
              <div>
                <h1 className='text-2xl font-black uppercase sm:text-3xl'>{title}</h1>
                <p className='mt-2 text-sm text-zinc-300'>{subtitle}</p>
              </div>
            </div>
            
            <button
              type="button"
              onClick={() => setShowNotifications(true)}
              className={`relative rounded-2xl border bg-black/55 p-3.5 text-gold-soft transition-all hover:border-gold/50 hover:bg-gold/10 shrink-0 mt-1 ${
                hasAlertActivity
                  ? 'border-gold/60 shadow-[0_0_32px_rgba(212,175,55,0.45)] animate-pulse'
                  : 'border-gold/25 shadow-[0_0_24px_rgba(212,175,55,0.12)]'
              }`}
              title="Open System Notifications"
            >
              <div className="relative">
                <Bell className="h-5 w-5" />
                {hasAlertActivity && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gold"></span>
                  </span>
                )}
              </div>
              {(unreadCount > 0 || systemAlerts.length > 0 || outboxEvents.some((evt) => ['failed', 'error'].includes(String(evt.status ?? '').toLowerCase()))) && (
                <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white shadow-lg border border-black">
                  {unreadCount + systemAlerts.length + outboxEvents.filter((evt) => ['failed', 'error'].includes(String(evt.status ?? '').toLowerCase())).length}
                </span>
              )}
            </button>
          </header>
          <section className='gb-no-print grid gap-3 sm:grid-cols-3'>
            {platformPulse.map((item) => (
              <div key={item.label} className='gb-platform-kpi'>
                <div className='relative z-10 flex items-center justify-between gap-3'>
                  <div className='min-w-0'>
                    <p className='truncate text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500'>{item.label}</p>
                    <p className='mt-1 text-sm font-black uppercase text-white'>{item.value}</p>
                  </div>
                  <Sparkles className='h-4 w-4 shrink-0 text-gold-soft' aria-hidden />
                </div>
                <div className='gb-goal-rail relative z-10 mt-3'>
                  <span style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </section>
          <SafeRenderBoundary label='Dashboard content'>
            <div className='gb-dashboard-content space-y-6'>{children}</div>
          </SafeRenderBoundary>
          <div className='gb-no-print'>
            <DashboardAuthDebugFooter />
          </div>
        </section>
      </div>

      {/* Sliding Notification Drawer */}
      <AnimatePresence>
        {showNotifications && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNotifications(false)}
              className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm"
            />
            
            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 right-0 z-[110] w-full max-w-sm border-l border-gold/20 bg-zinc-950/95 p-5 shadow-2xl backdrop-blur-md overflow-y-auto text-white"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3.5 mb-5">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-gold-soft animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Alerts & Messages</span>
                </div>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="rounded-lg border border-white/10 p-1 text-zinc-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Critical System Warnings */}
                {systemAlerts.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">System Warnings</p>
                    {systemAlerts.map((alert, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-xl bg-rose-500/10 border border-rose-500/25 px-3.5 py-2.5 text-xs text-rose-200">
                        <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                        <span>{alert}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* Unread Message summary */}
                <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-4 text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white flex items-center gap-1.5"><MessageSquare className="h-4 w-4 text-cyan-400" /> Chat Center</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${unreadCount > 0 ? 'bg-rose-500 text-white' : 'bg-white/5 text-zinc-500'}`}>
                      {unreadCount} New
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400">Manage client inbound messages and dispatch SOPs inside the communications dashboard.</p>
                  <Link href="/admin/messages" onClick={() => setShowNotifications(false)} className="text-[10px] font-black uppercase text-gold hover:underline inline-block pt-1">
                    Open Message Center →
                  </Link>
                </div>

                {/* Owner outbox / actionable notifications */}
                <div className="space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Owner Notifications</p>
                  {outboxEvents.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-xs text-zinc-500">
                      No notification outbox rows visible yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {outboxEvents.map((evt) => {
                        const status = String(evt.status ?? 'queued');
                        const kind = String(evt.kind ?? evt.template_key ?? 'notification');
                        const failed = ['failed', 'error'].includes(status.toLowerCase());
                        const href = evt.appointment_id ? `/admin/work-orders/${evt.appointment_id}` : '/admin/notifications';
                        return (
                          <Link
                            key={String(evt.id ?? evt.created_at)}
                            href={href}
                            onClick={() => setShowNotifications(false)}
                            className={`block rounded-xl border px-3.5 py-3 text-xs ${failed ? 'border-rose-500/30 bg-rose-500/10' : 'border-white/10 bg-zinc-900/40 hover:border-gold/25'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-bold capitalize text-white">{kind.replace(/_/g, ' ')}</p>
                                <p className="mt-1 text-[10px] text-zinc-500">{String(evt.error_message ?? evt.channel ?? 'system')}</p>
                                {evt.created_at ? (
                                  <p className="mt-1 text-[10px] font-mono text-zinc-400">
                                    {new Date(String(evt.created_at)).toLocaleString('en-US', {
                                      timeZone: 'America/Chicago',
                                      dateStyle: 'short',
                                      timeStyle: 'short',
                                    })}
                                  </p>
                                ) : null}
                              </div>
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${failed ? 'bg-rose-500/20 text-rose-100' : 'bg-white/5 text-zinc-400'}`}>
                                {status}
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Timeline activity log */}
                <div className="space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Recent Dispatch Activity</p>
                  {recentEvents.length === 0 ? (
                    <p className="text-xs text-zinc-500">No recent timeline events found.</p>
                  ) : (
                    <div className="space-y-3 pl-2 border-l border-white/10">
                      {recentEvents.map((evt, idx) => (
                        <div key={idx} className="relative text-xs">
                          <div className="absolute -left-[13px] top-1.5 h-1.5 w-1.5 rounded-full bg-gold-soft" />
                          <p className="font-bold text-white capitalize">{evt.event_type.replace(/_/g, ' ')}</p>
                          <p className="text-[9px] text-zinc-500 font-mono mt-0.5">
                            {new Date(evt.created_at).toLocaleString('en-US', {
                              timeZone: 'America/Chicago',
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}

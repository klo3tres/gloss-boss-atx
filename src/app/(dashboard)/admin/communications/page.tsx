import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bell, FileSignature, Megaphone, MessageSquare, Settings2 } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadCadenceRules } from '@/lib/customer-notification-cadence';
import { NotificationCadenceSettingsPanel } from '@/components/admin/notification-cadence-settings-panel';

export const dynamic = 'force-dynamic';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function whenChicago(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function AdminCommunicationsPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) notFound();

  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 86400000).toISOString();
  const nowIso = now.toISOString();

  const [{ data: upcoming }, cadence] = await Promise.all([
    admin
      .from('appointments')
      .select('id, guest_name, guest_email, guest_phone, scheduled_start, status, service_slug')
      .gte('scheduled_start', nowIso)
      .lte('scheduled_start', weekOut)
      .not('status', 'in', '("cancelled","canceled")')
      .order('scheduled_start', { ascending: true })
      .limit(60),
    loadCadenceRules(admin),
  ]);

  const appts = (upcoming ?? []) as Array<{
    id: string;
    guest_name?: string | null;
    guest_email?: string | null;
    scheduled_start?: string | null;
    service_slug?: string | null;
  }>;
  const ids = appts.map((a) => a.id);
  let signedSet = new Set<string>();
  if (ids.length) {
    const { data: signed } = await admin.from('signed_agreements').select('appointment_id').in('appointment_id', ids);
    signedSet = new Set((signed ?? []).map((r) => str((r as { appointment_id?: string }).appointment_id)));
  }
  const unsigned = appts.filter((a) => !signedSet.has(a.id));

  const hubs = [
    {
      href: '/admin/notifications',
      title: 'Activity Center',
      body: 'Event feed, delivery health, and cadence tools.',
      icon: Bell,
    },
    {
      href: '/admin/marketing',
      title: 'Marketing campaigns',
      body: 'Audience-based email and SMS promotions.',
      icon: Megaphone,
    },
    {
      href: '/admin/messages',
      title: 'Messages',
      body: 'Two-way customer conversation inbox.',
      icon: MessageSquare,
    },
    {
      href: '/admin/agreements',
      title: 'Agreements',
      body: 'Signed acknowledgments archive and PDF access.',
      icon: FileSignature,
    },
  ] as const;

  return (
    <DashboardShell
      title="Communications"
      subtitle="Transactional cadence, marketing outreach, and agreement follow-up in one place."
      role="admin"
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">How messaging works</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-bold text-foreground">Transactional</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Booking confirmations, appointment reminders, agreement links, receipts, and service updates.
                These keep the job moving and are not marketing blasts.
              </p>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Marketing</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Campaigns and promos. Email sends require an explicit marketing opt-in; SMS requires consent and
                STOP handling.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {hubs.map((h) => {
            const Icon = h.icon;
            return (
              <Link
                key={h.href}
                href={h.href}
                className="rounded-2xl border border-border bg-card p-4 transition hover:border-gold/30 hover:shadow-sm"
              >
                <Icon className="h-4 w-4 text-gold-soft" />
                <p className="mt-3 text-sm font-black text-foreground">{h.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{h.body}</p>
              </Link>
            );
          })}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Unsigned upcoming</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Next 7 days without a signed agreement — {unsigned.length} open.
              </p>
            </div>
            <Link href="/admin/agreements" className="text-[10px] font-black uppercase text-muted-foreground hover:text-gold-soft">
              View all agreements →
            </Link>
          </div>
          {unsigned.length === 0 ? (
            <p className="mt-4 rounded-xl border border-border bg-background/50 px-4 py-3 text-xs text-muted-foreground">
              All upcoming jobs in the next week have signed acknowledgments.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
              {unsigned.slice(0, 12).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">{str(a.guest_name) || 'Customer'}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {whenChicago(str(a.scheduled_start))}
                      {a.service_slug ? ` · ${str(a.service_slug).replace(/-/g, ' ')}` : ''}
                    </p>
                  </div>
                  <Link
                    href={`/tech/work-orders/${encodeURIComponent(a.id)}?shell=admin#agreement`}
                    className="rounded-lg border border-border px-3 py-1.5 text-[10px] font-black uppercase text-foreground hover:border-gold/40"
                  >
                    Open work order
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-gold-soft" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Cadence settings</p>
              <p className="text-xs text-muted-foreground">
                Welcome, reminders, agreement links, post-service, and rebook rules.
              </p>
            </div>
          </div>
          <NotificationCadenceSettingsPanel rules={cadence.rules} tablesReady={cadence.tablesReady} />
        </section>
      </div>
    </DashboardShell>
  );
}

import { notFound } from 'next/navigation';
import { AutomationCenterClient } from '@/components/admin/automation-center-client';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { displayMoney } from '@/lib/display-format';
import Link from 'next/link';
import { CampaignComposer } from '@/components/admin/campaign-composer';

export const dynamic = 'force-dynamic';

export default async function AutomationCenterPage() {
  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null)) notFound();
  const admin = tryCreateAdminSupabase();
  const recent = admin
    ? await admin
        .from('customer_campaigns')
        .select('id, name, status, recipients_eligible, recipients_excluded, sent_count, delivered_count, click_count, booking_count, revenue_cents, created_at, meta')
        .contains('meta', { kind: 'weather_campaign' })
        .order('created_at', { ascending: false })
        .limit(10)
    : { data: [] };
  const promotions = admin
    ? await admin.from('promo_codes').select('id, code, description, enabled, starts_at, ends_at, max_uses, current_uses').is('archived_at', null).order('created_at', { ascending: false }).limit(12)
    : { data: [] };

  return (
    <DashboardShell
      title="Automation Center"
      subtitle="Owner-controlled runs for follow-ups, reminders, referrals, Titan, and weather campaigns."
      role="admin"
    >
      <CampaignComposer />
      <AutomationCenterClient />
      <section className="mt-6 rounded-3xl border border-amber-400/20 bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-amber-300">Campaign offers</p>
            <p className="mt-1 text-xs text-muted-foreground">These are the real promotion records available to owner-approved automation drafts.</p>
          </div>
          <Link href="/admin/promotions" className="rounded-xl bg-amber-300 px-4 py-2 text-[10px] font-black uppercase text-black">Create or edit offers</Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(promotions.data ?? []).map((raw) => {
            const row = raw as Record<string, unknown>;
            const active = row.enabled !== false && (!row.ends_at || new Date(String(row.ends_at)).getTime() >= Date.now());
            return <div key={String(row.id)} className="rounded-2xl border border-border bg-background/60 p-4"><div className="flex items-center justify-between gap-2"><p className="font-mono text-sm font-black text-foreground">{String(row.code ?? 'OFFER')}</p><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${active ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-500/10 text-zinc-400'}`}>{active ? 'Available' : 'Inactive'}</span></div><p className="mt-2 text-xs text-muted-foreground">{String(row.description ?? 'No customer-facing description yet.')}</p><p className="mt-2 text-[10px] text-muted-foreground">Uses {Number(row.current_uses ?? 0)}{row.max_uses ? ` / ${Number(row.max_uses)}` : ' · unlimited'}</p></div>;
          })}
          {(promotions.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No promotion records yet. Create one before attaching an offer to a campaign.</p> : null}
        </div>
      </section>
      <section className="mt-6 rounded-3xl border border-border bg-card p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-cyan-300">Weather campaign dashboard</p>
          <p className="mt-1 text-xs text-muted-foreground">Drafts, audience safety, delivery, conversion, and attributed revenue.</p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="pb-3">Event</th><th className="pb-3">Created</th><th className="pb-3">Status</th><th className="pb-3">Eligible / blocked</th><th className="pb-3">Sent / delivered</th><th className="pb-3">Clicks</th><th className="pb-3">Bookings</th><th className="pb-3">Collected</th><th className="pb-3">Conversion</th><th className="pb-3">Revenue / recipient</th></tr></thead>
            <tbody>
              {(recent.data ?? []).map((raw) => {
                const row = raw as Record<string, unknown>;
                const eligible = Number(row.recipients_eligible ?? 0);
                const sent = Number(row.sent_count ?? 0);
                const bookings = Number(row.booking_count ?? 0);
                const revenue = Number(row.revenue_cents ?? 0);
                return <tr key={String(row.id)} className="border-t border-border/70 text-foreground"><td className="py-3 font-bold">{String(row.name ?? 'Weather campaign')}</td><td className="py-3 text-muted-foreground">{new Date(String(row.created_at)).toLocaleString()}</td><td className="py-3 uppercase">{String(row.status)}</td><td className="py-3">{eligible} / {Number(row.recipients_excluded ?? 0)}</td><td className="py-3">{sent} / {Number(row.delivered_count ?? 0)}</td><td className="py-3">{Number(row.click_count ?? 0)}</td><td className="py-3">{bookings}</td><td className="py-3">{displayMoney(revenue)}</td><td className="py-3">{sent ? `${((bookings / sent) * 100).toFixed(1)}%` : '—'}</td><td className="py-3">{sent ? displayMoney(Math.round(revenue / sent)) : '—'}</td></tr>;
              })}
            </tbody>
          </table>
          {(recent.data ?? []).length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No weather campaign drafts yet. Run the Weather campaign engine to create the first owner-review draft.</p> : null}
        </div>
      </section>
    </DashboardShell>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadVehicleIntelligence } from '@/lib/vehicle-intelligence';
import { displayMoney } from '@/lib/display-format';
import { Car, Calendar, User } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function VehicleIntelligencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const bundle = await loadVehicleIntelligence(admin, id);
  if (!bundle) notFound();

  return (
    <DashboardShell
      title="Vehicle intelligence"
      subtitle={`Service history, spend, and upsell signals for ${bundle.vehicle.description}`}
      role="admin"
    >
      <div className="mb-4">
        <Link href={`/admin/customers/${bundle.customer.id}`} className="text-xs font-bold uppercase text-gold-soft hover:underline">
          ← {bundle.customer.fullName}
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground">
            <Car className="h-3.5 w-3.5 text-gold-soft" />
            Visits
          </p>
          <p className="mt-2 text-lg font-black text-foreground">{bundle.visitCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground">
            <User className="h-3.5 w-3.5 text-gold-soft" />
            Lifetime spend
          </p>
          <p className="mt-2 text-lg font-black text-foreground">{displayMoney(bundle.totalSpentCents)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 text-gold-soft" />
            Last service
          </p>
          <p className="mt-2 text-lg font-black text-foreground">
            {bundle.lastServiceAt ? new Date(bundle.lastServiceAt).toLocaleDateString() : '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground">
            <Car className="h-3.5 w-3.5 text-gold-soft" />
            Vehicle
          </p>
          <p className="mt-2 text-lg font-black text-foreground">{bundle.vehicle.description}</p>
        </div>
      </section>

      {bundle.recommendations.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-gold/25 bg-gold/5 p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Titan recommendations</p>
          <ul className="mt-3 space-y-2 text-sm text-foreground">
            {bundle.recommendations.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Service history</p>
        {bundle.serviceHistory.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No linked appointments yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {bundle.serviceHistory.map((row) => (
              <li key={row.appointmentId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                <div>
                  <p className="font-bold text-foreground">{row.serviceSlug.replace(/-/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.scheduledStart ? new Date(row.scheduledStart).toLocaleString() : '—'} · {row.status}
                    {row.paymentStatus ? ` · ${row.paymentStatus}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-gold-soft">{displayMoney(row.totalCents)}</span>
                  <Link href={row.href} className="text-[10px] font-black uppercase text-gold-soft hover:underline">
                    Open job →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}

import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import Link from 'next/link';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function TitanBillingPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  return (
    <DashboardShell title="Titan Billing" subtitle="Internal workspace status" role={session.profile!.role as 'admin' | 'super_admin'} titanMode>
      <section className="max-w-2xl rounded-3xl border border-gold/20 bg-black/55 p-7">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-soft">Internal workspace</p>
        <h1 className="mt-3 text-2xl font-black text-white">Billing is not active for Gloss Boss ATX</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">Gloss Boss is Titan's internal production workspace. Subscription checkout, tiers, territory sales, and white-label entitlements are hidden until the commercial billing system completes production QA.</p>
        <Link href="/admin/titan/settings" className="mt-5 inline-flex rounded-xl border border-white/10 px-4 py-2 text-[10px] font-black uppercase text-zinc-200">Health & settings</Link>
      </section>
    </DashboardShell>
  );
}

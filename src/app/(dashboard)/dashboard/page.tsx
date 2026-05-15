import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type ApptRow = {
  id: string;
  status: string;
  scheduled_start: string;
  service_slug: string;
  vehicle_class: string;
  base_price_cents: number;
  deposit_amount_cents: number;
};

export default async function CustomerDashboardRootPage() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();

  let appointments: ApptRow[] = [];
  if (supabase && session.user) {
    const { data } = await supabase
      .from('appointments')
      .select('id, status, scheduled_start, service_slug, vehicle_class, base_price_cents, deposit_amount_cents')
      .order('scheduled_start', { ascending: false })
      .limit(40);
    appointments = (data ?? []) as ApptRow[];
  }

  const upcoming = appointments.filter((a) => !['completed', 'cancelled'].includes(a.status)).slice(0, 8);
  const history = appointments.filter((a) => ['completed', 'cancelled'].includes(a.status)).slice(0, 8);

  return (
    <DashboardShell
      title='Your Gloss Boss dashboard'
      subtitle='Appointments, deposits, and rebooking — synced from Supabase.'
      role='customer'
    >
      <div className='grid gap-6 lg:grid-cols-2'>
        <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
          <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Upcoming</p>
          <ul className='mt-4 space-y-3'>
            {upcoming.length === 0 ? <li className='text-sm text-zinc-500'>No upcoming appointments.</li> : null}
            {upcoming.map((a) => (
              <li key={a.id} className='rounded-xl border border-white/10 bg-black/40 px-4 py-3'>
                <p className='text-sm font-bold text-white'>{a.service_slug.replace(/-/g, ' ')}</p>
                <p className='text-xs text-zinc-400'>{new Date(a.scheduled_start).toLocaleString()}</p>
                <p className='mt-1 text-[10px] uppercase tracking-wider text-gold-soft'>{a.status}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
          <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>History</p>
          <ul className='mt-4 space-y-3'>
            {history.length === 0 ? <li className='text-sm text-zinc-500'>No completed visits yet.</li> : null}
            {history.map((a) => (
              <li key={a.id} className='rounded-xl border border-white/10 bg-black/40 px-4 py-3'>
                <p className='text-sm font-bold text-white'>{a.service_slug.replace(/-/g, ' ')}</p>
                <p className='text-xs text-zinc-400'>{new Date(a.scheduled_start).toLocaleDateString()}</p>
                <p className='mt-1 text-xs text-zinc-500'>
                  Paid deposit ${(a.deposit_amount_cents / 100).toFixed(2)} · Package ${(a.base_price_cents / 100).toFixed(0)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className='mt-6 flex flex-wrap gap-3'>
        <Link href='/book' className='rounded-lg bg-gold px-5 py-3 text-sm font-bold uppercase tracking-wider text-black'>
          Rebook service
        </Link>
        <Link href='/gift-cards' className='rounded-lg border border-gold/40 px-5 py-3 text-sm font-bold uppercase tracking-wider text-gold-soft'>
          Gift cards
        </Link>
        <Link href='/agreement' className='rounded-lg border border-white/15 px-5 py-3 text-sm font-bold uppercase tracking-wider text-zinc-300'>
          Liability acknowledgment
        </Link>
      </div>
    </DashboardShell>
  );
}

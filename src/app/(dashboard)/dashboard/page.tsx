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

  job_started_at: string | null;

  job_completed_at: string | null;
  booking_vehicles?: unknown;
  service_address?: string | null;
  service_city?: string | null;
  service_state?: string | null;
  service_zip?: string | null;
  balance_due_cents?: number | null;
  payment_status?: string | null;

};



type TimelineRow = {

  appointment_id: string;

  event_type: string;

  created_at: string;

  meta: Record<string, unknown> | null;

};



type MediaRow = {

  appointment_id: string;

  file_url: string;

  category: string;

  visible_to_customer: boolean | null;

};

type PaymentRow = {
  appointment_id: string;
  amount_cents: number;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
};

type AgreementRow = {
  appointment_id: string;
  signed_at: string | null;
};



function friendlyEventLabel(t: string): string {

  return t.replace(/_/g, ' ');

}

function chicago(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}



export default async function CustomerDashboardRootPage() {

  const session = await getSessionWithProfile();

  const supabase = await createSupabaseServerClient();



  let appointments: ApptRow[] = [];

  const eventsByAppt = new Map<string, TimelineRow[]>();

  const photosByAppt = new Map<string, MediaRow[]>();
  const paymentsByAppt = new Map<string, PaymentRow[]>();
  const agreementByAppt = new Map<string, AgreementRow>();



  if (supabase && session.user) {

    const { data } = await supabase

      .from('appointments')

      .select(

        'id, status, scheduled_start, service_slug, vehicle_class, booking_vehicles, service_address, service_city, service_state, service_zip, base_price_cents, deposit_amount_cents, balance_due_cents, payment_status, job_started_at, job_completed_at',

      )

      .order('scheduled_start', { ascending: false })

      .limit(40);

    appointments = (data ?? []) as ApptRow[];



    const ids = appointments.map((a) => a.id);

    if (ids.length > 0) {

      const [evRes, medRes, payRes, agRes] = await Promise.all([

        supabase

          .from('job_timeline_events')

          .select('appointment_id, event_type, created_at, meta')

          .in('appointment_id', ids)

          .order('created_at', { ascending: false })

          .limit(400),

        supabase

          .from('job_media')

          .select('appointment_id, file_url, category, visible_to_customer')

          .in('appointment_id', ids)

          .order('created_at', { ascending: false })

          .limit(200),
        supabase
          .from('payments')
          .select('appointment_id, amount_cents, status, payment_method, paid_at')
          .in('appointment_id', ids)
          .order('paid_at', { ascending: false })
          .limit(100),
        supabase
          .from('signed_agreements')
          .select('appointment_id, signed_at')
          .in('appointment_id', ids)
          .order('signed_at', { ascending: false })
          .limit(100),

      ]);



      for (const row of (evRes.data ?? []) as TimelineRow[]) {

        const list = eventsByAppt.get(row.appointment_id) ?? [];

        if (list.length < 12) list.push(row);

        eventsByAppt.set(row.appointment_id, list);

      }



      for (const row of (medRes.data ?? []) as MediaRow[]) {

        if (!row.visible_to_customer) continue;

        const list = photosByAppt.get(row.appointment_id) ?? [];

        if (list.length < 8) list.push(row);

        photosByAppt.set(row.appointment_id, list);

      }

      for (const row of (payRes.data ?? []) as PaymentRow[]) {
        const list = paymentsByAppt.get(row.appointment_id) ?? [];
        list.push(row);
        paymentsByAppt.set(row.appointment_id, list);
      }

      for (const row of (agRes.data ?? []) as AgreementRow[]) {
        if (!agreementByAppt.has(row.appointment_id)) agreementByAppt.set(row.appointment_id, row);
      }

    }

  }



  const upcoming = appointments.filter((a) => !['completed', 'cancelled'].includes(a.status)).slice(0, 8);

  const history = appointments.filter((a) => ['completed', 'cancelled'].includes(a.status)).slice(0, 8);

  const liveJob = upcoming.find((a) => a.status === 'in_progress' || (a.job_started_at && !a.job_completed_at));



  const liveEvents = liveJob ? eventsByAppt.get(liveJob.id) ?? [] : [];
  const vehicleTotal = appointments.reduce((sum, a) => sum + (Array.isArray(a.booking_vehicles) ? a.booking_vehicles.length : 1), 0);
  const receiptTotal = Array.from(paymentsByAppt.values()).reduce((sum, rows) => sum + rows.length, 0);
  const photoTotal = Array.from(photosByAppt.values()).reduce((sum, rows) => sum + rows.length, 0);
  const agreementTotal = agreementByAppt.size;



  return (

    <DashboardShell

      title='Your Gloss Boss dashboard'

      subtitle='Appointments, deposits, and live job updates — synced from Supabase.'

      role='customer'

    >

      {liveJob ? (

        <div

          className='mb-6 rounded-2xl border border-emerald-500/40 bg-emerald-950/25 p-5'

          role='status'

          aria-live='polite'

        >

          <p className='text-xs font-bold uppercase tracking-wider text-emerald-300'>Live service</p>

          <p className='mt-2 text-lg font-bold text-white'>Your Gloss Boss service has started.</p>

          <p className='mt-1 text-sm text-zinc-300'>

            {liveJob.service_slug.replace(/-/g, ' ')} · {chicago(liveJob.scheduled_start)}

          </p>

          {liveEvents.length > 0 ? (

            <ul className='mt-3 space-y-1 text-xs text-zinc-400'>

              {liveEvents.slice(0, 6).map((e) => (

                <li key={`${e.event_type}-${e.created_at}`}>

                  <span className='text-gold-soft'>{friendlyEventLabel(e.event_type)}</span>{' '}

                  · {chicago(e.created_at)}

                </li>

              ))}

            </ul>

          ) : (

            <p className='mt-2 text-xs text-zinc-500'>Live milestones (start, timer, checklist) will appear here as your tech updates the job.</p>

          )}

        </div>

      ) : null}

      <section className='mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {[
          ['Overview', `${appointments.length} appointment(s)`, 'Bookings and service history'],
          ['Vehicle garage', `${vehicleTotal} vehicle(s)`, 'Saved from booking records'],
          ['Invoices / receipts', `${receiptTotal} receipt(s)`, 'Stripe, cash, and comped records'],
          ['Photos', `${photoTotal} approved`, 'Before/after gallery items'],
          ['Signed agreements', `${agreementTotal} signed`, 'Legal acknowledgements'],
          ['Messages', 'Inbox ready', 'Replies and job updates'],
          ['Reviews', 'Leave feedback', 'Review CTA after completion'],
          ['Gift cards', 'Available', 'Book again or gift a detail'],
        ].map(([title, value, hint]) => (
          <article key={title} className='rounded-2xl border border-gold/20 bg-gradient-to-br from-zinc-950/95 to-black/80 p-4 shadow-[0_0_24px_rgba(212,166,77,0.08)]'>
            <p className='text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>{title}</p>
            <p className='mt-2 text-xl font-black text-white'>{value}</p>
            <p className='mt-1 text-xs text-zinc-500'>{hint}</p>
          </article>
        ))}
      </section>

      <div className='grid gap-6 lg:grid-cols-2'>

        <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>

          <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Upcoming</p>

          <ul className='mt-4 space-y-3'>

            {upcoming.length === 0 ? <li className='text-sm text-zinc-500'>No upcoming appointments.</li> : null}

            {upcoming.map((a) => {

              const ev = eventsByAppt.get(a.id) ?? [];
              const pays = paymentsByAppt.get(a.id) ?? [];
              const vehicleCount = Array.isArray(a.booking_vehicles) ? a.booking_vehicles.length : 1;
              const addr = [a.service_address, a.service_city, a.service_state, a.service_zip].filter(Boolean).join(', ');

              return (

                <li key={a.id} className='rounded-xl border border-white/10 bg-black/40 px-4 py-3'>

                  <p className='text-sm font-bold text-white'>{a.service_slug.replace(/-/g, ' ')}</p>

                  <p className='text-xs text-zinc-400'>{chicago(a.scheduled_start)}</p>
                  <p className='mt-1 text-xs text-zinc-500'>{vehicleCount} vehicle{vehicleCount === 1 ? '' : 's'} · {addr || 'Service address pending'}</p>
                  <p className='mt-1 text-xs text-zinc-500'>Payment: {a.payment_status ?? 'pending'} · Balance ${((a.balance_due_cents ?? 0) / 100).toFixed(2)} · Receipts {pays.length}</p>
                  <p className='mt-1 text-xs text-zinc-500'>Agreement: {agreementByAppt.has(a.id) ? 'signed' : 'pending'}</p>

                  <p className='mt-1 text-[10px] uppercase tracking-wider text-gold-soft'>{a.status.replace(/_/g, ' ')}</p>

                  {ev.length > 0 ? (

                    <p className='mt-2 text-[10px] text-zinc-500'>

                      Latest: {friendlyEventLabel(ev[0]!.event_type)} ·{' '}

                      {chicago(ev[0]!.created_at)}

                    </p>

                  ) : null}

                </li>

              );

            })}

          </ul>

        </section>

        <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>

          <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>History</p>

          <ul className='mt-4 space-y-3'>

            {history.length === 0 ? <li className='text-sm text-zinc-500'>No completed visits yet.</li> : null}

            {history.map((a) => {

              const ev = eventsByAppt.get(a.id) ?? [];

              const photos = photosByAppt.get(a.id) ?? [];
              const pays = paymentsByAppt.get(a.id) ?? [];
              const vehicleCount = Array.isArray(a.booking_vehicles) ? a.booking_vehicles.length : 1;

              return (

                <li key={a.id} className='rounded-xl border border-white/10 bg-black/40 px-4 py-3'>

                  <p className='text-sm font-bold text-white'>{a.service_slug.replace(/-/g, ' ')}</p>

                  <p className='text-xs text-zinc-400'>{chicago(a.scheduled_start)}</p>

                  <p className='mt-1 text-xs text-zinc-500'>

                    {vehicleCount} vehicle{vehicleCount === 1 ? '' : 's'} · Paid deposit ${(a.deposit_amount_cents / 100).toFixed(2)} · Package ${(a.base_price_cents / 100).toFixed(0)} · Receipts {pays.length}

                  </p>

                  {a.status === 'completed' ? (

                    <p className='mt-1 text-[10px] uppercase tracking-wider text-emerald-400'>Completed</p>

                  ) : null}

                  {ev.filter((x) => x.event_type === 'job_completed').length > 0 ? (

                    <p className='mt-1 text-[10px] text-zinc-500'>

                      Completed log ·{' '}

                      {chicago(ev.find((x) => x.event_type === 'job_completed')?.created_at ?? a.scheduled_start)}

                    </p>

                  ) : null}

                  {photos.length > 0 ? (

                    <div className='mt-2 flex flex-wrap gap-2'>

                      {photos.map((p) => (

                        <a

                          key={p.file_url}

                          href={p.file_url}

                          target='_blank'

                          rel='noopener noreferrer'

                          className='text-[10px] font-semibold uppercase tracking-wider text-gold-soft underline'

                        >

                          View {p.category} photo

                        </a>

                      ))}

                    </div>

                  ) : a.status === 'completed' ? (

                    <p className='mt-2 text-[10px] text-zinc-600'>After photos appear here when QC is approved for customer viewing.</p>

                  ) : null}

                </li>

              );

            })}

          </ul>

        </section>

      </div>

      <div className='mt-6 flex flex-wrap gap-3'>

        <Link href='/book' className='rounded-lg bg-gold px-5 py-3 text-sm font-bold uppercase tracking-wider text-black'>

          Rebook service

        </Link>

        <Link

          href='/gift-cards'

          className='rounded-lg border border-gold/40 px-5 py-3 text-sm font-bold uppercase tracking-wider text-gold-soft'

        >

          Gift cards

        </Link>

        <Link

          href={appointments[0]?.id ? `/agreement?appointment_id=${encodeURIComponent(appointments[0].id)}` : '/agreement'}

          className='rounded-lg border border-white/15 px-5 py-3 text-sm font-bold uppercase tracking-wider text-zinc-300'

        >

          Liability acknowledgment

        </Link>

      </div>

    </DashboardShell>

  );

}


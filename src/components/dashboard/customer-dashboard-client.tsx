'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Car, FileText, Gift, MessageSquare, Receipt, Sparkles, Star } from 'lucide-react';
import { GlassCard, IconTile, PremiumBadge, SectionEyebrow, TimelineRail } from '@/components/ui/premium';
import type { CustomerApptSnapshotView } from '@/lib/customer-dashboard-snapshot';

export type CustomerAppt = {
  id: string;
  status: string;
  scheduled_start: string;
  service_slug: string;
  base_price_cents: number;
  deposit_amount_cents: number;
  balance_due_cents?: number | null;
  payment_status?: string | null;
  guest_email?: string | null;
  service_address?: string | null;
  service_city?: string | null;
  service_state?: string | null;
  service_zip?: string | null;
  booking_vehicles?: unknown;
  vehicle_class: string;
};

export type CustomerDashboardProps = {
  googleReviewUrl?: string;
  liveJob: CustomerAppt | null;
  liveEvents: Array<{ event_type: string; created_at: string }>;
  upcoming: CustomerAppt[];
  inFlight?: CustomerAppt[];
  pending?: CustomerAppt[];
  history: CustomerAppt[];
  eventsByAppt: Record<string, Array<{ event_type: string; created_at: string }>>;
  paymentsByAppt: Record<string, Array<{ amount_cents: number; status: string }>>;
  receiptsByAppt: Record<string, Array<{ receipt_number: string | null; created_at: string }>>;
  agreementByAppt: Record<string, boolean>;
  agreementHrefByAppt: Record<string, string>;
  photosByAppt: Record<string, Array<{ file_url: string; category: string }>>;
  vehicleTotal: number;
  receiptTotal: number;
  photoTotal: number;
  agreementTotal: number;
  appointmentCount: number;
  snapshotByAppt?: Record<string, CustomerApptSnapshotView>;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function apptFromSnapshot(appt: CustomerAppt, snap?: CustomerApptSnapshotView): CustomerAppt & { snap?: CustomerApptSnapshotView } {
  if (!snap) return appt;
  return {
    ...appt,
    base_price_cents: snap.finalTotalCents,
    deposit_amount_cents: snap.depositPaidCents,
    balance_due_cents: snap.balanceDueCents,
    payment_status: snap.paymentStatus,
    service_address: snap.serviceAddress || appt.service_address,
    booking_vehicles: snap.vehicles.map((v) => ({
      vehicle_description: v.description,
      service_slug: v.serviceSlug,
      vehicle_class: v.vehicleClass,
      add_on_slugs: v.addOns.map((a) => a.label),
    })),
    snap,
  };
}

function chicago(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return '—';
  }
}

function friendlyEvent(t: string) {
  return t.replace(/_/g, ' ');
}

function vehiclesFrom(appt: CustomerAppt) {
  const raw = appt.booking_vehicles;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((v, i) => {
      const row = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
      return String(row.vehicle_description ?? row.description ?? `Vehicle ${i + 1}`);
    });
  }
  return ['Vehicle on file'];
}

export function CustomerDashboardClient(props: CustomerDashboardProps) {
  const loyaltyVisits = props.history.filter((a) => a.status === 'completed').length;
  const appointmentCards = useMemo(() => {
    const seen = new Set<string>();
    const out: CustomerAppt[] = [];
    for (const a of [...(props.inFlight ?? []), ...(props.pending ?? []), ...props.upcoming]) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
    return out;
  }, [props.inFlight, props.pending, props.upcoming]);
  const liveJob = props.liveJob
    ? apptFromSnapshot(props.liveJob, props.snapshotByAppt?.[props.liveJob.id])
    : null;

  return (
    <div className='space-y-8'>
      {props.googleReviewUrl ? (
        <a
          href={props.googleReviewUrl}
          target='_blank'
          rel='noreferrer'
          className='flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-6 py-4 text-sm font-black uppercase tracking-wider text-black shadow-[0_0_32px_rgba(212,175,55,0.35)]'
        >
          <Star className='h-5 w-5' /> Leave Google review
        </a>
      ) : null}
      {liveJob ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className='gb-glass rounded-3xl border border-emerald-500/35 p-6 shadow-[0_0_40px_rgba(16,185,129,0.12)]'>
          <div className='flex items-center gap-2'>
            <Sparkles className='h-5 w-5 text-emerald-300' />
            <SectionEyebrow>Live service</SectionEyebrow>
          </div>
          <p className='mt-3 text-2xl font-black text-white'>Your detail is in progress</p>
          <p className='mt-1 text-zinc-400'>
            {liveJob.service_slug.replace(/-/g, ' ')} · {chicago(liveJob.scheduled_start)}
          </p>
          {liveJob.balance_due_cents != null && liveJob.balance_due_cents > 0 ? (
            <p className='mt-2 text-sm text-amber-200'>Balance due {money(liveJob.balance_due_cents)}</p>
          ) : null}
          {props.liveEvents.length > 0 ? (
            <div className='mt-4'>
              <TimelineRail
                events={props.liveEvents.slice(0, 6).map((e, i) => ({
                  id: `${e.event_type}-${i}`,
                  title: friendlyEvent(e.event_type),
                  time: chicago(e.created_at),
                }))}
              />
            </div>
          ) : (
            <p className='mt-3 text-sm text-zinc-500'>Updates appear here as your technician progresses.</p>
          )}
        </motion.div>
      ) : null}

      <section className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <IconTile icon={<Car className='h-5 w-5' />} label='Vehicle garage' value={`${props.vehicleTotal}`} />
        <IconTile icon={<Receipt className='h-5 w-5' />} label='Receipts' value={`${props.receiptTotal}`} />
        <IconTile icon={<FileText className='h-5 w-5' />} label='Agreements' value={`${props.agreementTotal} signed`} />
        <IconTile icon={<MessageSquare className='h-5 w-5' />} label='Messages' value='Inbox' href='/dashboard/messages' />
      </section>

      <div className='grid gap-6 lg:grid-cols-3'>
        <GlassCard className='lg:col-span-2' glow>
          <SectionEyebrow>Upcoming appointments</SectionEyebrow>
          {(props.inFlight?.length ?? 0) > 0 ? (
            <p className='mt-2 text-xs text-emerald-300'>{props.inFlight!.length} in progress right now</p>
          ) : null}
          {(props.pending?.length ?? 0) > 0 ? (
            <p className='mt-1 text-xs text-amber-200'>{props.pending!.length} pending confirmation or payment</p>
          ) : null}
          <ul className='mt-5 space-y-4'>
            {appointmentCards.length === 0 ? (
              <li className='text-sm text-zinc-500'>No upcoming appointments.</li>
            ) : null}
            {appointmentCards.map((raw) => {
              const a = apptFromSnapshot(raw, props.snapshotByAppt?.[raw.id]);
              const receipts = props.receiptsByAppt[a.id] ?? [];
              const addr =
                a.service_address ||
                [raw.service_address, raw.service_city, raw.service_state, raw.service_zip].filter(Boolean).join(', ');
              return (
                <li key={a.id} className='gb-glass rounded-2xl border border-white/10 p-5'>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div>
                      <p className='text-lg font-bold text-white'>{a.service_slug.replace(/-/g, ' ')}</p>
                      <p className='text-sm text-gold-soft'>{chicago(a.scheduled_start)}</p>
                      {a.balance_due_cents != null && a.balance_due_cents > 0 ? (
                        <p className='mt-1 text-xs text-amber-200'>Balance due {money(a.balance_due_cents)}</p>
                      ) : (
                        <p className='mt-1 text-xs text-zinc-500'>Total {money(a.base_price_cents)}</p>
                      )}
                    </div>
                    {props.agreementByAppt[a.id] && props.agreementHrefByAppt[a.id] ? (
                      <Link href={props.agreementHrefByAppt[a.id]} className='text-xs font-black uppercase text-gold-soft underline'>
                        View agreement PDF
                      </Link>
                    ) : (
                      <PremiumBadge tone='amber'>Agreement pending</PremiumBadge>
                    )}
                  </div>
                  <p className='mt-3 text-sm text-zinc-400'>{addr || 'Address pending'}</p>
                  <div className='mt-3 flex flex-wrap gap-2'>
                    {vehiclesFrom(a).map((v) => (
                      <span key={v} className='rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-zinc-300'>
                        {v}
                      </span>
                    ))}
                  </div>
                  {receipts[0] ? (
                    <p className='mt-3 text-xs text-emerald-300'>Receipt {receipts[0].receipt_number ?? 'on file'} · {chicago(receipts[0].created_at)}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </GlassCard>

        <div className='space-y-6'>
          <GlassCard>
            <SectionEyebrow>Loyalty</SectionEyebrow>
            <p className='mt-3 text-4xl font-black text-gold-soft'>{loyaltyVisits}</p>
            <p className='text-sm text-zinc-400'>Completed visits with Gloss Boss ATX</p>
            <p className='mt-4 text-xs text-zinc-500'>Book again to keep your vehicles showroom-ready year-round.</p>
            <Link href='/book' className='mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-gold py-3 text-xs font-black uppercase text-black'>
              Book again
            </Link>
          </GlassCard>

          <GlassCard>
            <SectionEyebrow>Reviews</SectionEyebrow>
            <p className='mt-3 text-sm text-zinc-400'>Share how we did after your last visit.</p>
            {props.googleReviewUrl ? (
              <a
                href={props.googleReviewUrl}
                target='_blank'
                rel='noreferrer'
                className='mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-4 py-3 text-xs font-black uppercase text-black shadow-[0_0_24px_rgba(212,175,55,0.35)]'
              >
                <Star className='h-4 w-4' /> LEAVE GOOGLE REVIEW
              </a>
            ) : (
              <p className='mt-4 text-xs text-zinc-500'>Google review link is not configured yet. Contact support if you would like to leave feedback.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionEyebrow>Gift cards</SectionEyebrow>
            <Link href='/gift-cards' className='mt-3 inline-flex items-center gap-2 text-sm font-bold text-white'>
              <Gift className='h-4 w-4 text-gold-soft' /> Send a detail
            </Link>
          </GlassCard>
        </div>
      </div>

      <GlassCard>
        <SectionEyebrow>Service history</SectionEyebrow>
        <ul className='mt-5 grid gap-4 md:grid-cols-2'>
          {props.history.length === 0 ? <li className='text-sm text-zinc-500'>No completed visits yet.</li> : null}
          {props.history.map((raw) => {
            const a = apptFromSnapshot(raw, props.snapshotByAppt?.[raw.id]);
            const photos = props.photosByAppt[a.id] ?? [];
            const payments = props.paymentsByAppt[a.id] ?? [];
            return (
              <li key={a.id} className='rounded-2xl border border-white/10 bg-black/30 p-4'>
                <p className='font-bold text-white'>{a.service_slug.replace(/-/g, ' ')}</p>
                <p className='text-xs text-zinc-500'>{chicago(a.scheduled_start)}</p>
                <p className='mt-1 text-xs text-zinc-400'>Total {money(a.base_price_cents)}</p>
                {payments[0] ? (
                  <p className='text-xs text-emerald-300/90'>
                    Paid {money(payments[0].amount_cents)} · {payments[0].status}
                  </p>
                ) : null}
                {photos.length > 0 ? (
                  <div className='mt-3 flex gap-2 overflow-x-auto'>
                    {photos.slice(0, 4).map((p) => (
                      <a key={p.file_url} href={p.file_url} target='_blank' rel='noreferrer' className='block shrink-0'>
                        <img src={p.file_url} alt='' className='h-16 w-16 rounded-lg object-cover ring-1 ring-gold/20' />
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </GlassCard>

      <div className='flex flex-wrap gap-3'>
        <Link href='/book' className='rounded-2xl bg-gold px-6 py-3 text-xs font-black uppercase text-black'>
          Rebook service
        </Link>
        {Object.keys(props.agreementHrefByAppt).length > 0 ? (
          <Link
            href={props.agreementHrefByAppt[Object.keys(props.agreementHrefByAppt)[0]!]}
            className='rounded-2xl border border-white/15 px-6 py-3 text-xs font-black uppercase text-zinc-300'
          >
            View signed agreement
          </Link>
        ) : null}
      </div>
    </div>
  );
}

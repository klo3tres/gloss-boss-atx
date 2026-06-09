'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Car, Gift, MessageSquare, Sparkles, Star, Award, Calendar, Image } from 'lucide-react';
import { GlassCard, IconTile, PremiumBadge, SectionEyebrow, TimelineRail } from '@/components/ui/premium';
import { LoyaltyCard3D } from '@/components/dashboard/loyalty-card-3d';
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
  loyaltyStampsCount?: number;
  activeCardDesign?: any;
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
  const loyaltyVisits = typeof props.loyaltyStampsCount === 'number'
    ? props.loyaltyStampsCount
    : props.history.filter((a) => a.status === 'completed').length;

  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const box = card.getBoundingClientRect();
    const x = e.clientX - box.left - box.width / 2;
    const y = e.clientY - box.top - box.height / 2;
    setRotateX(-y / 12);
    setRotateY(x / 12);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
    setIsHovered(false);
  };
  
  // Extract garage list of unique vehicles
  const uniqueVehicles = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ description: string; vehicleClass: string }> = [];
    const allAppts = [...props.history, ...(props.inFlight ?? []), ...(props.pending ?? []), ...props.upcoming];
    for (const raw of allAppts) {
      const a = apptFromSnapshot(raw, props.snapshotByAppt?.[raw.id]);
      const vehicles = a.booking_vehicles;
      if (Array.isArray(vehicles)) {
        for (const v of vehicles) {
          const row = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
          const desc = String(row.vehicle_description ?? row.description ?? '').trim();
          if (desc && !seen.has(desc.toLowerCase())) {
            seen.add(desc.toLowerCase());
            list.push({
              description: desc,
              vehicleClass: String(row.vehicle_class ?? a.vehicle_class ?? 'Standard'),
            });
          }
        }
      }
    }
    return list;
  }, [props.history, props.inFlight, props.pending, props.upcoming, props.snapshotByAppt]);

  // Compile all uploaded before/after gallery photos
  const allGalleryPhotos = useMemo(() => {
    const photos: Array<{ url: string; category: string; apptId: string; service: string }> = [];
    for (const [apptId, list] of Object.entries(props.photosByAppt)) {
      const appt = props.history.find(h => h.id === apptId) || props.upcoming.find(u => u.id === apptId);
      const service = appt ? appt.service_slug.replace(/-/g, ' ') : 'Detail';
      for (const p of list) {
        photos.push({ url: p.file_url, category: p.category, apptId, service });
      }
    }
    return photos;
  }, [props.photosByAppt, props.history, props.upcoming]);

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

  const reviewUrl = props.googleReviewUrl?.trim() || '';

  // Loyalty stepper variables
  const loyaltyTarget = 5;
  const currentStep = loyaltyVisits % loyaltyTarget;
  const loyaltyPercent = Math.round((currentStep / loyaltyTarget) * 100);

  return (
    <div className="space-y-8 rounded-3xl p-1 sm:p-2">
      {/* Review Callout */}
      <section className="gb-premium-card rounded-3xl border border-gold/30 p-6 shadow-[0_0_40px_rgba(212,175,55,0.15)] backdrop-blur">
        <SectionEyebrow>Thank you</SectionEyebrow>
        <p className="mt-2 text-lg font-black text-white uppercase tracking-tight">Love your shine? Leave a Google review</p>
        <p className="mt-1 text-sm text-zinc-400">Helps Gloss Boss ATX grow — takes under a minute.</p>
        {reviewUrl ? (
          <a
            href={reviewUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-gold via-gold-soft to-gold px-6 py-4 text-sm font-black uppercase tracking-wider text-black shadow-[0_0_32px_rgba(212,175,55,0.35)] hover:brightness-110 transition duration-300"
          >
            <Star className="h-5 w-5 fill-black" /> Leave Google review
          </a>
        ) : (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Review link loading — refresh shortly or contact support.
          </p>
        )}
      </section>

      {/* Live Job tracker */}
      {liveJob ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="gb-premium-card rounded-3xl border border-emerald-500/35 p-6 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-300" />
            <SectionEyebrow>Live service</SectionEyebrow>
          </div>
          <p className="mt-3 text-2xl font-black text-white uppercase tracking-tight">Your detail is in progress</p>
          <p className="mt-1 text-zinc-400">
            {liveJob.service_slug.replace(/-/g, ' ')} · {chicago(liveJob.scheduled_start)}
          </p>
          {liveJob.balance_due_cents != null && liveJob.balance_due_cents > 0 ? (
            <p className="mt-2 text-sm text-amber-200 font-bold">Balance due {money(liveJob.balance_due_cents)}</p>
          ) : null}
          {props.liveEvents.length > 0 ? (
            <div className="mt-4 border-t border-white/5 pt-4">
              <TimelineRail
                events={props.liveEvents.slice(0, 6).map((e, i) => ({
                  id: `${e.event_type}-${i}`,
                  title: friendlyEvent(e.event_type),
                  time: chicago(e.created_at),
                }))}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Updates appear here as your technician progresses.</p>
          )}
        </motion.div>
      ) : null}

      {/* Grid of Key summaries */}
      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <IconTile icon={<Car className="h-5 w-5" />} label="Garage Count" value={`${uniqueVehicles.length} vehicles`} />
        <IconTile icon={<Calendar className="h-5 w-5" />} label="Upcoming" value={`${appointmentCards.length} appointments`} />
        <IconTile icon={<Award className="h-5 w-5" />} label="Loyalty Stamps" value={`${loyaltyVisits} earned`} />
        <IconTile icon={<MessageSquare className="h-5 w-5" />} label="Inbox Logs" value={`${props.agreementTotal} signed docs`} href="/dashboard/messages" />
      </section>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Scheduled Appointments & Vehicles Garage */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upcoming Schedule */}
          <GlassCard glow>
            <SectionEyebrow>Upcoming appointments</SectionEyebrow>
            {(props.inFlight?.length ?? 0) > 0 ? (
              <p className="mt-2 text-xs text-emerald-300 font-bold uppercase tracking-wider">{props.inFlight!.length} in progress right now</p>
            ) : null}
            {(props.pending?.length ?? 0) > 0 ? (
              <p className="mt-1 text-xs text-amber-200 font-bold uppercase tracking-wider">{props.pending!.length} pending confirmation or payment</p>
            ) : null}
            <ul className="mt-5 space-y-4">
              {appointmentCards.length === 0 ? (
                <li className="text-sm text-zinc-500 italic py-6 border border-dashed border-white/5 rounded-2xl text-center">
                  No upcoming details scheduled.
                </li>
              ) : null}
              {appointmentCards.map((raw) => {
                const a = apptFromSnapshot(raw, props.snapshotByAppt?.[raw.id]);
                const receipts = props.receiptsByAppt[a.id] ?? [];
                const addr =
                  a.service_address ||
                  [raw.service_address, raw.service_city, raw.service_state, raw.service_zip].filter(Boolean).join(', ');
                return (
                  <li key={a.id} className="gb-premium-card rounded-2xl border border-gold/15 bg-black/40 p-5 hover:border-gold/30 hover:shadow-[0_0_20px_rgba(212,175,55,0.08)] transition duration-300">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-black uppercase tracking-tight text-white">{a.service_slug.replace(/-/g, ' ')}</p>
                        <p className="text-sm text-gold-soft font-medium mt-0.5">{chicago(a.scheduled_start)}</p>
                        {a.balance_due_cents != null && a.balance_due_cents > 0 ? (
                          <p className="mt-1.5 text-xs font-bold text-amber-200 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded inline-block">Balance due {money(a.balance_due_cents)}</p>
                        ) : (
                          <p className="mt-1.5 text-xs text-zinc-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded inline-block">Total {money(a.base_price_cents)}</p>
                        )}
                      </div>
                      {props.agreementByAppt[a.id] && props.agreementHrefByAppt[a.id] ? (
                        <Link href={props.agreementHrefByAppt[a.id]} className="text-xs font-black uppercase tracking-wider text-gold-soft hover:underline">
                          View agreement PDF
                        </Link>
                      ) : (
                        <PremiumBadge tone="amber">Agreement pending</PremiumBadge>
                      )}
                    </div>
                    <p className="mt-4 text-sm text-zinc-300 border-t border-white/5 pt-3">{addr || 'Address pending'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {vehiclesFrom(a).map((v) => (
                        <span key={v} className="rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs text-zinc-300 font-bold">
                          {v}
                        </span>
                      ))}
                    </div>
                    {receipts[0] ? (
                      <p className="mt-3 text-xs text-emerald-300/90 font-mono">Receipt {receipts[0].receipt_number ?? 'on file'} · {chicago(receipts[0].created_at)}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </GlassCard>

          {/* Vehicle Garage Grid */}
          <GlassCard>
            <SectionEyebrow>Vehicle Garage</SectionEyebrow>
            {uniqueVehicles.length === 0 ? (
              <p className="text-xs text-zinc-500 italic mt-4 py-4 text-center">No vehicles in your virtual garage yet.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {uniqueVehicles.map((v, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3.5 rounded-2xl border border-white/5 bg-zinc-950/20 p-4 hover:border-gold/25 transition duration-300"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold-soft">
                      <Car className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{v.description}</p>
                      <span className="inline-block mt-0.5 rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-black uppercase text-zinc-400">
                        {v.vehicleClass}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Right Column: Loyalty Tracker & Google Review */}
        <div className="space-y-6">
          {/* Luxury 3D Carbon & Gold Punch Card */}
          <LoyaltyCard3D 
            activeCardDesign={props.activeCardDesign} 
            stampsCount={loyaltyVisits} 
            customerEmail={props.history[0]?.guest_email || 'VIP MEMBER'} 
          />
          <p className="text-[10px] text-zinc-500 text-center mt-1">
            💡 Click card to flip front/back
          </p>

          {/* Stepper Progress Visualizer (Subtle text info card) */}
          <GlassCard className="border-zinc-900 bg-black/30 mt-2">
            <p className="text-xs text-zinc-500 text-center leading-relaxed">
              Complete {loyaltyTarget - currentStep} more service{loyaltyTarget - currentStep === 1 ? '' : 's'} to unlock your next luxury detailing reward.
            </p>
            <Link
              href="/book"
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold py-3 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_24px_rgba(212,175,55,0.15)] hover:brightness-110 transition duration-300"
            >
              Book Detailing Service
            </Link>
          </GlassCard>

          {/* Google Review Box */}
          <GlassCard>
            <SectionEyebrow>Reviews</SectionEyebrow>
            <p className="mt-3 text-sm text-zinc-400">Share how we did after your last visit.</p>
            {props.googleReviewUrl ? (
              <a
                href={props.googleReviewUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold px-4 py-3.5 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_24px_rgba(212,175,55,0.25)] hover:brightness-110 transition duration-300"
              >
                <Star className="h-4 w-4 fill-black" /> LEAVE GOOGLE REVIEW
              </a>
            ) : (
              <p className="mt-4 text-xs text-zinc-500 italic">Google review link is not configured yet. Contact support if you would like to leave feedback.</p>
            )}
          </GlassCard>

          {/* Gift Cards */}
          <GlassCard>
            <SectionEyebrow>Gift cards</SectionEyebrow>
            <Link href="/gift-cards" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-white hover:text-gold-soft transition duration-200">
              <Gift className="h-4 w-4 text-gold-soft" /> Send a detail to someone
            </Link>
          </GlassCard>
        </div>
      </div>

      {/* Cinematic Transformations Before/After Gallery */}
      {allGalleryPhotos.length > 0 && (
        <GlassCard>
          <div className="flex items-center justify-between border-b border-white/5 pb-3.5 mb-5">
            <div>
              <SectionEyebrow>Client Gallery</SectionEyebrow>
              <h3 className="text-lg font-black text-white mt-1">Cinematic Transformations</h3>
            </div>
            <Image className="h-5 w-5 text-gold-soft" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {allGalleryPhotos.map((p, idx) => (
              <div
                key={idx}
                className="group relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-950/40 aspect-square hover:border-gold/30 transition duration-300"
              >
                <img
                  src={p.url}
                  alt={p.service}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                  <span className="text-[9px] font-black uppercase text-gold-soft tracking-wider">
                    {p.category}
                  </span>
                  <p className="text-xs font-bold text-white truncate mt-0.5">
                    {p.service}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Service history list */}
      <GlassCard>
        <SectionEyebrow>Service history</SectionEyebrow>
        <ul className="mt-5 grid gap-4 md:grid-cols-2">
          {props.history.length === 0 ? <li className="text-sm text-zinc-500 italic">No completed visits yet.</li> : null}
          {props.history.map((raw) => {
            const a = apptFromSnapshot(raw, props.snapshotByAppt?.[raw.id]);
            const photos = props.photosByAppt[a.id] ?? [];
            const payments = props.paymentsByAppt[a.id] ?? [];
            return (
              <li key={a.id} className="rounded-2xl border border-white/5 bg-black/40 p-5 hover:border-gold/20 transition">
                <p className="font-black uppercase text-white tracking-tight">{a.service_slug.replace(/-/g, ' ')}</p>
                <p className="text-xs text-zinc-500 font-medium mt-0.5">{chicago(a.scheduled_start)}</p>
                <p className="mt-2 text-xs text-zinc-400 font-mono">Total {money(a.base_price_cents)}</p>
                {payments[0] ? (
                  <p className="text-xs text-emerald-300/90 font-mono mt-1">
                    Paid {money(payments[0].amount_cents)} · {payments[0].status}
                  </p>
                ) : null}
                {photos.length > 0 ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {photos.slice(0, 4).map((p) => (
                      <a key={p.file_url} href={p.file_url} target="_blank" rel="noreferrer" className="block shrink-0 transition-transform hover:scale-105">
                        <img src={p.file_url} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-gold/20" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </GlassCard>

      <div className="flex flex-wrap gap-4">
        <Link href="/book" className="rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold px-8 py-4 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_24px_rgba(212,175,55,0.25)] hover:brightness-110 transition duration-300">
          Rebook service
        </Link>
        {Object.keys(props.agreementHrefByAppt).length > 0 ? (
          <Link
            href={props.agreementHrefByAppt[Object.keys(props.agreementHrefByAppt)[0]!]}
            className="rounded-xl border border-white/20 bg-black/40 px-8 py-4 text-xs font-black uppercase tracking-widest text-white hover:border-gold/45 hover:text-gold-soft transition duration-300"
          >
            View signed agreement
          </Link>
        ) : null}
      </div>
    </div>
  );
}

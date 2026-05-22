'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, CreditCard, FileSignature, MapPin, Phone } from 'lucide-react';
import { useMemo } from 'react';
import { PremiumBadge, ProgressTracker, SectionEyebrow, StickyActionBar, TimelineRail } from '@/components/ui/premium';
import { NotificationSendForm } from '@/components/tech/notification-send-form';
import { TechTimerControls } from '@/app/(dashboard)/tech/tech-timer-controls';
import { WorkOrderPhotoUpload } from '@/app/(dashboard)/tech/work-order-photo-upload';
import { WorkOrderGallery, type WorkOrderGalleryPhoto } from '@/app/(dashboard)/tech/work-order-gallery';
import { WorkOrderVehiclesForm } from '@/components/tech/work-order-vehicles-form';
export type WorkOrderConsoleData = {
  id: string;
  canonicalId: string;
  source: 'appointment' | 'fallback';
  isFallback: boolean;
  shellBackHref: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  serviceLabel: string;
  statusLabel: string;
  fullAddress: string;
  serviceAddress: string;
  serviceCity: string;
  serviceState: string;
  serviceZip: string;
  mapsHref: string;
  baseTotal: string;
  balanceDue: string;
  paymentStatus: string;
  paymentComplete: boolean;
  agreementSigned: boolean;
  agreementCaptureHref: string;
  agreementDetailHref: string;
  requirements: Array<{ label: string; ok: boolean }>;
  timeline: Array<{ id: string; title: string; time: string }>;
  notes: Array<{ id: string; vehicleLabel: string; time: string; body: string }>;
  outbox: Array<{ id: string; kind: string; status: string; time: string; skipped?: string }>;
  beforePhotos: WorkOrderGalleryPhoto[];
  afterPhotos: WorkOrderGalleryPhoto[];
  technicianName: string;
  jobStartedAt: string;
  jobCompletedAt: string;
  recentPayments: Array<{ amount: string; status: string; method: string; at: string }>;
  vehicles: Array<{
    year: string;
    make: string;
    model: string;
    description: string;
    color: string;
    service: string;
    vehicleClass: string;
    label: string;
    partsLine: string;
    priceCents: number | null;
    priceLabel: string;
  }>;
  job: {
    id: string;
    status: string;
    service_slug: string;
    notes: string | null;
    fallback_booking_id: string | null;
    workflowSessionId: string | null;
    isFallback: boolean;
  };
  hasIntake: boolean;
  workflowSessionId: string | null;
  openTimerId: string;
  openTimerStartedAt: string;
  vehicleForms: {
    defaultService: string;
    defaultClass: string;
  };
};

export function WorkOrderConsoleClient({
  data,
  updateDetailsAction,
  updateVehiclesAction,
  recordCashAction,
  completeJobAction,
}: {
  data: WorkOrderConsoleData;
  updateDetailsAction: (formData: FormData) => void | Promise<void>;
  updateVehiclesAction: (formData: FormData) => void | Promise<void>;
  recordCashAction: (formData: FormData) => void | Promise<void>;
  completeJobAction: (formData: FormData) => void | Promise<void>;
}) {
  const progressPct = useMemo(() => {
    const ok = data.requirements.filter((r) => r.ok).length;
    return data.requirements.length ? Math.round((ok / data.requirements.length) * 100) : 0;
  }, [data.requirements]);

  const jobId = data.canonicalId;

  return (
    <div className='gb-page-pad space-y-6 pb-32 md:space-y-8'>
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className='overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-br from-zinc-950 via-black to-zinc-900 shadow-[0_0_50px_rgba(212,175,55,0.14)]'
      >
        <div className='bg-gradient-to-br from-zinc-950 via-black to-zinc-900 px-6 py-8 sm:px-8'>
          <div className='flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between'>
            <div>
              <div className='flex flex-wrap gap-2'>
                <PremiumBadge tone='gold'>{data.statusLabel}</PremiumBadge>
                <PremiumBadge tone={data.agreementSigned ? 'emerald' : 'amber'}>
                  <FileSignature className='h-3 w-3' />
                  {data.agreementSigned ? 'Agreement signed' : 'Agreement needed'}
                </PremiumBadge>
                <PremiumBadge tone={data.paymentComplete ? 'emerald' : 'amber'}>
                  <CreditCard className='h-3 w-3' />
                  {data.paymentComplete ? 'Paid' : data.paymentStatus}
                </PremiumBadge>
              </div>
              <h1 className='mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl'>{data.guestName}</h1>
              <p className='mt-2 text-lg text-zinc-400'>
                {data.serviceLabel} · {progressPct}% complete
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              {data.guestPhone ? (
                <a href={`tel:${data.guestPhone}`} className='inline-flex items-center gap-2 rounded-2xl bg-gold px-5 py-3 text-xs font-black uppercase text-black'>
                  <Phone className='h-4 w-4' /> Call
                </a>
              ) : null}
              {data.fullAddress ? (
                <a href={data.mapsHref} target='_blank' rel='noreferrer' className='inline-flex items-center gap-2 rounded-2xl border border-gold/35 px-5 py-3 text-xs font-black uppercase text-gold-soft'>
                  <MapPin className='h-4 w-4' /> Directions
                </a>
              ) : null}
              <Link href={data.shellBackHref} className='rounded-2xl border border-white/15 px-5 py-3 text-xs font-black uppercase text-zinc-300'>
                Back
              </Link>
            </div>
          </div>
          <div className='mt-8'>
            <ProgressTracker steps={data.requirements} />
          </div>
        </div>
      </motion.section>

      <section className='space-y-6'>
        <div>
          <SectionEyebrow>Job overview</SectionEyebrow>
          <div className='mt-3 grid gap-3 text-sm sm:grid-cols-2'>
            <p className='text-zinc-400'>
              Total <span className='font-mono text-white'>{data.baseTotal}</span> · Due{' '}
              <span className='font-mono text-gold-soft'>{data.balanceDue}</span>
            </p>
            {data.technicianName ? <p className='text-zinc-400'>Tech: {data.technicianName}</p> : null}
            {data.jobStartedAt ? <p className='text-zinc-400'>Started {data.jobStartedAt}</p> : null}
            {data.jobCompletedAt ? <p className='text-zinc-400'>Completed {data.jobCompletedAt}</p> : null}
          </div>
          <div className='mt-4 max-h-48 overflow-y-auto'>
            <TimelineRail events={data.timeline} />
          </div>
        </div>

        <div className='border-t border-white/10 pt-6'>
          <SectionEyebrow>Customer</SectionEyebrow>
          <p className='mt-2 text-xl font-bold text-white'>{data.guestName}</p>
          {data.guestPhone ? <p className='text-sm text-zinc-300'>{data.guestPhone}</p> : null}
          {data.guestEmail ? <p className='text-sm text-zinc-400'>{data.guestEmail}</p> : null}
          {data.fullAddress ? <p className='mt-2 text-sm text-zinc-500'>{data.fullAddress}</p> : null}
          <form action={updateDetailsAction} className='mt-4 grid gap-2 sm:grid-cols-2'>
            <input type='hidden' name='id' value={jobId} />
            <input type='hidden' name='source' value={data.source} />
              <input name='guestName' defaultValue={data.guestName} placeholder='Name' className='gb-input' />
              <input name='guestPhone' defaultValue={data.guestPhone} placeholder='Phone' className='gb-input' />
              <input name='guestEmail' defaultValue={data.guestEmail} placeholder='Email' className='gb-input sm:col-span-2' />
              <input name='serviceAddress' defaultValue={data.serviceAddress} placeholder='Street' className='gb-input sm:col-span-2' />
              <input name='serviceCity' defaultValue={data.serviceCity} placeholder='City' className='gb-input' />
              <input name='serviceState' defaultValue={data.serviceState} placeholder='State' className='gb-input' />
              <input name='serviceZip' defaultValue={data.serviceZip} placeholder='ZIP' className='gb-input' />
              <button type='submit' className='sm:col-span-2 rounded-2xl bg-gold px-4 py-3 text-xs font-black uppercase text-black'>
                Save customer
              </button>
            </form>
        </div>

        <div className='border-t border-white/10 pt-6'>
          <WorkOrderVehiclesForm
            id={jobId}
            source={data.source}
            defaultService={data.vehicleForms.defaultService}
            defaultClass={data.vehicleForms.defaultClass}
            saveAction={updateVehiclesAction}
            initialVehicles={data.vehicles.map((v) => ({
              year: v.year,
              make: v.make,
              model: v.model,
              description: v.description,
              color: v.color,
              service: v.service,
              vehicleClass: v.vehicleClass,
              priceCents: v.priceCents,
            }))}
          />
        </div>

        <div className='border-t border-white/10 pt-6'>
          <SectionEyebrow>Agreement</SectionEyebrow>
          <div className='mt-3 flex flex-wrap gap-2'>
            <Link href={data.agreementCaptureHref} className='rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs font-black uppercase text-gold-soft'>
              Recapture agreement
            </Link>
            <Link href={data.agreementDetailHref} className='rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black uppercase text-zinc-200'>
              View agreement
            </Link>
          </div>
        </div>

        <div className='border-t border-white/10 pt-6'>
          <SectionEyebrow>Photos</SectionEyebrow>
          <div className='mt-4 space-y-6'>
            <WorkOrderGallery title='Before' photos={data.beforePhotos} />
            <WorkOrderGallery title='After' photos={data.afterPhotos} />
          </div>
          {data.vehicles.map((v, i) => (
            <div key={i} className='mt-4 border-t border-white/5 pt-4'>
              <p className='text-xs font-bold text-zinc-400'>{v.label}</p>
              <WorkOrderPhotoUpload
                appointmentId={data.isFallback ? null : jobId}
                fallbackBookingId={data.isFallback ? jobId : null}
                workflowSessionId={data.workflowSessionId}
                vehicleIndex={i}
                vehicleLabel={v.label}
              />
            </div>
          ))}
        </div>

        <div className='border-t border-white/10 pt-6'>
          <SectionEyebrow>Notes</SectionEyebrow>
          <ul className='mt-3 max-h-56 space-y-2 overflow-y-auto text-sm'>
            {data.notes.length === 0 ? <li className='text-zinc-500'>No notes yet.</li> : null}
            {data.notes.map((n) => (
              <li key={n.id} className='rounded-xl border border-white/10 bg-black/30 px-3 py-2'>
                <p className='text-[10px] font-bold uppercase text-gold-soft'>{n.vehicleLabel}</p>
                <p className='text-zinc-500'>{n.time}</p>
                <p className='mt-1 text-zinc-300'>{n.body}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className='border-t border-white/10 pt-6'>
          <div className='flex items-center gap-2'>
            <Clock className='h-5 w-5 text-gold-soft' />
            <SectionEyebrow>Timer</SectionEyebrow>
          </div>
          <div className='mt-3'>
            <TechTimerControls
              appointmentId={data.isFallback ? null : jobId}
              fallbackBookingId={data.isFallback ? jobId : null}
              workflowSessionId={data.workflowSessionId}
              initialTimerId={data.openTimerId || null}
              initialStartedAt={data.openTimerStartedAt || null}
            />
          </div>
        </div>

        <div className='border-t border-white/10 pt-6'>
          <SectionEyebrow>Payment & closeout</SectionEyebrow>
          <form action={recordCashAction} className='mt-3 grid gap-2'>
            {!data.isFallback ? <input type='hidden' name='appointmentId' value={jobId} /> : null}
            {data.isFallback ? <input type='hidden' name='fallbackBookingId' value={jobId} /> : null}
            <input name='amountReceived' placeholder='Amount received' className='gb-input' />
            <input name='changeGiven' placeholder='Change' className='gb-input' />
            <input name='cashNote' placeholder='Note' className='gb-input' />
            <button type='submit' className='rounded-2xl bg-emerald-500 px-4 py-3 text-xs font-black uppercase text-black'>
              Record cash
            </button>
          </form>
          {!data.isFallback ? (
            <form action={completeJobAction} className='mt-3'>
              <input type='hidden' name='appointmentId' value={jobId} />
              {data.workflowSessionId ? <input type='hidden' name='workflowSessionId' value={data.workflowSessionId} /> : null}
              <button type='submit' className='flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-4 text-sm font-black uppercase text-black'>
                <CheckCircle2 className='h-5 w-5' /> Complete job
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <StickyActionBar>
        <Link href={data.agreementCaptureHref} className='rounded-xl border border-gold/40 px-3 py-2.5 text-[10px] font-black uppercase text-gold-soft'>
          Agreement
        </Link>
        <NotificationSendForm
          kind='payment_link'
          appointmentId={!data.isFallback ? jobId : undefined}
          fallbackBookingId={data.isFallback ? jobId : undefined}
          buttonClassName='rounded-xl bg-gold px-3 py-2.5 text-[10px] font-black uppercase text-black'
        >
          Pay now
        </NotificationSendForm>
        <NotificationSendForm
          kind='last_touches'
          appointmentId={!data.isFallback ? jobId : undefined}
          fallbackBookingId={data.isFallback ? jobId : undefined}
          buttonClassName='rounded-xl border border-white/20 px-3 py-2.5 text-[10px] font-black uppercase text-zinc-200'
        >
          Last touches
        </NotificationSendForm>
      </StickyActionBar>
    </div>
  );
}

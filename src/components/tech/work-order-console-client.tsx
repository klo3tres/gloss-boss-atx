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
  depositPaid?: string;
  finalTotal?: string;
  paymentMethod?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  accessLocation?: string;
  accessWater?: string;
  accessPower?: string;
  accessParking?: string;
  gateNotes?: string;
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
  recentPayments: Array<{ id?: string; amount: string; status: string; method: string; at: string; stripe?: string }>;
  receiptPdfHref?: string;
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
  generateReceiptAction,
  sendReceiptAction,
}: {
  data: WorkOrderConsoleData;
  updateDetailsAction: (formData: FormData) => void | Promise<void>;
  updateVehiclesAction: (formData: FormData) => void | Promise<void>;
  recordCashAction: (formData: FormData) => void | Promise<void>;
  completeJobAction: (formData: FormData) => void | Promise<void>;
  generateReceiptAction?: (formData: FormData) => void | Promise<void>;
  sendReceiptAction?: (formData: FormData) => void | Promise<void>;
}) {
  const progressPct = useMemo(() => {
    const ok = data.requirements.filter((r) => r.ok).length;
    return data.requirements.length ? Math.round((ok / data.requirements.length) * 100) : 0;
  }, [data.requirements]);

  const jobId = data.canonicalId;

  return (
    <div className='gb-page-pad space-y-5 pb-28 md:space-y-8 md:pb-32'>
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className='rounded-3xl border border-gold/25 bg-gradient-to-br from-zinc-950 via-black to-zinc-900 px-5 py-6 shadow-[0_0_50px_rgba(212,175,55,0.14)] sm:px-8 sm:py-8'
      >
        <div className='flex flex-wrap gap-2'>
          <PremiumBadge tone='gold'>{data.statusLabel}</PremiumBadge>
          <PremiumBadge tone={data.agreementSigned ? 'emerald' : 'amber'}>
            <FileSignature className='h-3 w-3' />
            {data.agreementSigned ? 'Signed' : 'Agreement'}
          </PremiumBadge>
          <PremiumBadge tone={data.paymentComplete ? 'emerald' : 'amber'}>
            <CreditCard className='h-3 w-3' />
            {data.paymentComplete ? 'Paid' : data.paymentStatus}
          </PremiumBadge>
        </div>
        <h1 className='mt-4 text-2xl font-black text-white sm:text-4xl'>{data.guestName}</h1>
        <p className='mt-1 text-sm text-zinc-400'>
          {data.serviceLabel} · {progressPct}% · {data.scheduledStart || 'Schedule TBD'}
          {data.scheduledEnd ? ` → ${data.scheduledEnd}` : ''}
        </p>
        <div className='mt-4 flex flex-wrap gap-2'>
          {data.guestPhone ? (
            <a href={`tel:${data.guestPhone}`} className='inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-[10px] font-black uppercase text-black'>
              <Phone className='h-4 w-4' /> Call
            </a>
          ) : null}
          {data.fullAddress ? (
            <a href={data.mapsHref} target='_blank' rel='noreferrer' className='inline-flex items-center gap-2 rounded-xl border border-gold/35 px-4 py-2.5 text-[10px] font-black uppercase text-gold-soft'>
              <MapPin className='h-4 w-4' /> Map
            </a>
          ) : null}
          <Link href={data.shellBackHref} className='rounded-xl border border-white/15 px-4 py-2.5 text-[10px] font-black uppercase text-zinc-300'>
            Back
          </Link>
        </div>
        <div className='mt-6'>
          <ProgressTracker steps={data.requirements} />
        </div>
      </motion.section>

      <div className='sticky top-2 z-20 rounded-2xl border border-gold/30 bg-black/90 px-4 py-3 backdrop-blur-md md:static md:border-white/10 md:bg-transparent md:px-0 md:py-0'>
        <div className='flex items-center gap-2'>
          <Clock className='h-4 w-4 text-gold-soft' />
          <SectionEyebrow>Timer</SectionEyebrow>
        </div>
        <TechTimerControls
          appointmentId={data.isFallback ? null : jobId}
          fallbackBookingId={data.isFallback ? jobId : null}
          workflowSessionId={data.workflowSessionId}
          initialTimerId={data.openTimerId || null}
          initialStartedAt={data.openTimerStartedAt || null}
        />
      </div>

      <section className='space-y-8'>
        <div>
          <SectionEyebrow>Job summary</SectionEyebrow>
          <div className='mt-3 grid gap-2 text-sm sm:grid-cols-2'>
            <p className='text-zinc-400'>
              Total <span className='font-mono text-white'>{data.finalTotal || data.baseTotal}</span>
            </p>
            <p className='text-zinc-400'>
              Deposit <span className='font-mono text-white'>{data.depositPaid || '—'}</span>
            </p>
            <p className='text-zinc-400'>
              Balance due <span className='font-mono text-gold-soft'>{data.balanceDue}</span>
            </p>
            {data.paymentMethod ? <p className='text-zinc-400'>Payment: {data.paymentMethod}</p> : null}
            {data.technicianName ? <p className='text-zinc-400'>Tech: {data.technicianName}</p> : null}
          </div>
        </div>

        <div>
          <SectionEyebrow>Customer & address</SectionEyebrow>
          {data.guestPhone ? <p className='mt-2 text-sm text-zinc-300'>{data.guestPhone}</p> : null}
          {data.guestEmail ? <p className='text-sm text-zinc-400'>{data.guestEmail}</p> : null}
          {data.fullAddress ? <p className='mt-2 text-sm text-zinc-500'>{data.fullAddress}</p> : null}
          {(data.accessLocation || data.accessWater) && (
            <ul className='mt-3 space-y-1 text-xs text-zinc-400'>
              {data.accessLocation ? <li>Location: {data.accessLocation}</li> : null}
              {data.accessWater ? <li>Water: {data.accessWater}</li> : null}
              {data.accessPower ? <li>Power: {data.accessPower}</li> : null}
              {data.accessParking ? <li>Parking: {data.accessParking}</li> : null}
              {data.gateNotes ? <li>Access notes: {data.gateNotes}</li> : null}
            </ul>
          )}
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
            <button type='submit' className='sm:col-span-2 rounded-2xl border border-gold/40 px-4 py-3 text-xs font-black uppercase text-gold-soft'>
              Save customer
            </button>
          </form>
        </div>

        <div>
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

        <div>
          <SectionEyebrow>Agreement</SectionEyebrow>
          <div className='mt-3 flex flex-wrap gap-2'>
            <Link href={data.agreementCaptureHref} className='rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs font-black uppercase text-gold-soft'>
              Recapture
            </Link>
            <Link href={data.agreementDetailHref} className='rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black uppercase text-zinc-200'>
              View agreement
            </Link>
          </div>
        </div>

        <div id='photos'>
          <SectionEyebrow>Photos</SectionEyebrow>
          <WorkOrderGallery title='Before' photos={data.beforePhotos} />
          <WorkOrderGallery title='After' photos={data.afterPhotos} />
          {data.vehicles.map((v, i) => (
            <div key={i} className='mt-4'>
              <p className='mb-2 text-xs font-bold text-zinc-400'>{v.label}</p>
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

        <div>
          <SectionEyebrow>Notes</SectionEyebrow>
          <ul className='mt-3 max-h-48 space-y-2 overflow-y-auto text-sm'>
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

        <div>
          <SectionEyebrow>Payment</SectionEyebrow>
          <ul className='mt-3 space-y-2 text-sm'>
            {data.recentPayments.length === 0 ? <li className='text-zinc-500'>No payments logged yet.</li> : null}
            {data.recentPayments.map((p) => (
              <li key={p.id || p.at} className='flex justify-between gap-2 rounded-xl border border-white/10 px-3 py-2'>
                <span className='text-zinc-300'>
                  {p.method} {p.stripe ? `· ${p.stripe}` : ''}
                </span>
                <span className='font-mono text-white'>
                  {p.amount} · {p.status}
                </span>
              </li>
            ))}
          </ul>
          <div className='mt-4 grid gap-2 sm:grid-cols-2'>
            <NotificationSendForm
              kind='payment_link'
              appointmentId={!data.isFallback ? jobId : undefined}
              fallbackBookingId={data.isFallback ? jobId : undefined}
              buttonClassName='w-full rounded-2xl bg-gold px-4 py-3 text-xs font-black uppercase text-black'
            >
              Send balance link
            </NotificationSendForm>
            <form action={recordCashAction} className='grid gap-2'>
              {!data.isFallback ? <input type='hidden' name='appointmentId' value={jobId} /> : null}
              {data.isFallback ? <input type='hidden' name='fallbackBookingId' value={jobId} /> : null}
              <input name='amountReceived' placeholder='Cash received ($)' className='gb-input' />
              <button type='submit' className='rounded-2xl bg-emerald-500 px-4 py-3 text-xs font-black uppercase text-black'>
                Mark cash paid
              </button>
            </form>
            {generateReceiptAction ? (
              <form action={generateReceiptAction}>
                {!data.isFallback ? <input type='hidden' name='appointmentId' value={jobId} /> : null}
                {data.isFallback ? <input type='hidden' name='fallbackBookingId' value={jobId} /> : null}
                <button type='submit' className='w-full rounded-2xl border border-white/20 px-4 py-3 text-xs font-black uppercase text-zinc-200'>
                  Generate receipt
                </button>
              </form>
            ) : null}
            {sendReceiptAction ? (
              <form action={sendReceiptAction}>
                {!data.isFallback ? <input type='hidden' name='appointmentId' value={jobId} /> : null}
                {data.isFallback ? <input type='hidden' name='fallbackBookingId' value={jobId} /> : null}
                <button type='submit' className='w-full rounded-2xl border border-gold/35 px-4 py-3 text-xs font-black uppercase text-gold-soft'>
                  Send receipt email
                </button>
              </form>
            ) : null}
            {data.receiptPdfHref ? (
              <a href={data.receiptPdfHref} target='_blank' rel='noreferrer' className='flex items-center justify-center rounded-2xl border border-white/15 px-4 py-3 text-xs font-black uppercase text-zinc-200'>
                Download invoice PDF
              </a>
            ) : null}
          </div>
          {!data.isFallback ? (
            <form action={completeJobAction} className='mt-4'>
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
        <Link href={data.agreementCaptureHref} className='flex-1 rounded-xl border border-gold/40 px-3 py-3 text-center text-[10px] font-black uppercase text-gold-soft'>
          Agreement
        </Link>
        <a href='#photos' className='flex-1 rounded-xl border border-white/20 px-3 py-3 text-center text-[10px] font-black uppercase text-zinc-200'>
          Photos
        </a>
        <NotificationSendForm
          kind='payment_link'
          appointmentId={!data.isFallback ? jobId : undefined}
          fallbackBookingId={data.isFallback ? jobId : undefined}
          buttonClassName='flex-1 rounded-xl bg-gold px-3 py-3 text-center text-[10px] font-black uppercase text-black'
        >
          Payment
        </NotificationSendForm>
        {!data.isFallback ? (
          <form action={completeJobAction} className='flex-1'>
            <input type='hidden' name='appointmentId' value={jobId} />
            {data.workflowSessionId ? <input type='hidden' name='workflowSessionId' value={data.workflowSessionId} /> : null}
            <button type='submit' className='w-full rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-3 py-3 text-[10px] font-black uppercase text-emerald-200'>
              Complete
            </button>
          </form>
        ) : null}
      </StickyActionBar>
    </div>
  );
}

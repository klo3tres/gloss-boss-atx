'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, CreditCard, FileSignature, MapPin, Phone } from 'lucide-react';
import { useMemo } from 'react';
import { PremiumBadge, ProgressTracker, SectionEyebrow, StickyActionBar, TimelineRail } from '@/components/ui/premium';
import { NotificationSendForm } from '@/components/tech/notification-send-form';
import { WorkOrderBalanceCheckout } from '@/components/tech/work-order-balance-checkout';
import { TechTimerControls } from '@/app/(dashboard)/tech/tech-timer-controls';
import { WorkOrderPhotoUpload } from '@/app/(dashboard)/tech/work-order-photo-upload';
import { WorkOrderCustomCharges } from '@/components/tech/work-order-custom-charges';
import type { ReceiptBreakdownLine } from '@/lib/receipt-breakdown';
import { WorkOrderGallery, type WorkOrderGalleryPhoto } from '@/app/(dashboard)/tech/work-order-gallery';
import { WorkOrderVehiclesForm } from '@/components/tech/work-order-vehicles-form';
import { WorkOrderCollapsible } from '@/components/tech/work-order-collapsible';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import {
  generateWorkOrderReceiptActionState,
  sendWorkOrderReceiptEmailAction,
} from '@/app/(dashboard)/tech/work-order-payment-actions';
import { ReceiptPdfDownloadButton } from '@/components/ui/receipt-pdf-download-button';

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
  baseSubtotal: string;
  balanceDue: string;
  balanceDueCents: number;
  depositPaid?: string;
  depositOnFile?: string;
  finalTotal?: string;
  stripePaid?: string;
  cashPaid?: string;
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
  canDeletePhotos?: boolean;
  photosByVehicle: Array<{
    vehicleIndex: number;
    label: string;
    service?: string;
    before: WorkOrderGalleryPhoto[];
    after: WorkOrderGalleryPhoto[];
  }>;
  multiCarDiscount?: string;
  onlineDiscount?: string;
  promoDiscount?: string;
  totalPaid?: string;
  technicianName: string;
  jobStartedAt: string;
  jobCompletedAt: string;
  recentPayments: Array<{ id?: string; amount: string; status: string; method: string; at: string; stripe?: string }>;
  receiptPdfHref?: string;
  customerId?: string;
  customLineItems?: Array<{ id: string; label: string; amountCents: number }>;
  customLineItemsTotal?: string;
  pricingBreakdown?: ReceiptBreakdownLine[];
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
  canAdminOverride = false,
}: {
  data: WorkOrderConsoleData;
  updateDetailsAction: (formData: FormData) => void | Promise<void>;
  updateVehiclesAction: (formData: FormData) => void | Promise<void>;
  recordCashAction: (formData: FormData) => void | Promise<void>;
  completeJobAction: (formData: FormData) => void | Promise<void>;
  canAdminOverride?: boolean;
}) {
  const progressPct = useMemo(() => {
    const ok = data.requirements.filter((r) => r.ok).length;
    return data.requirements.length ? Math.round((ok / data.requirements.length) * 100) : 0;
  }, [data.requirements]);

  const jobId = data.canonicalId;

  return (
    <div className='gb-page-pad space-y-5 pb-40 md:space-y-8 md:pb-24'>
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className='gb-premium-hero rounded-3xl px-5 py-6 sm:px-8 sm:py-8'
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

      <div className='rounded-2xl border border-white/10 bg-black/50 px-4 py-3 lg:sticky lg:top-2 lg:z-10 lg:border-gold/30 lg:bg-black/90 lg:backdrop-blur-md'>
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

      <section className='space-y-4'>
        <WorkOrderCollapsible title='Job summary' defaultOpen>
          <div className='grid gap-2 text-sm sm:grid-cols-2'>
            <p className='text-zinc-400'>
              Base subtotal <span className='font-mono text-white'>{data.baseSubtotal}</span>
            </p>
            {data.onlineDiscount ? (
              <p className='text-zinc-400'>
                Online booking discount <span className='font-mono text-emerald-300'>−{data.onlineDiscount}</span>
              </p>
            ) : null}
            {data.multiCarDiscount ? (
              <p className='text-zinc-400'>
                Multi-car discount <span className='font-mono text-emerald-300'>−{data.multiCarDiscount}</span>
              </p>
            ) : null}
            {data.promoDiscount ? (
              <p className='text-zinc-400'>
                Promo discount <span className='font-mono text-emerald-300'>−{data.promoDiscount}</span>
              </p>
            ) : null}
            <p className='text-zinc-400 sm:col-span-2'>
              Final total <span className='font-mono text-lg text-gold-soft'>{data.finalTotal}</span>
            </p>
            <p className='text-zinc-400'>
              Deposit paid <span className='font-mono text-white'>{data.depositPaid || '—'}</span>
            </p>
            {data.stripePaid ? (
              <p className='text-zinc-400'>
                Stripe paid <span className='font-mono text-emerald-300'>{data.stripePaid}</span>
              </p>
            ) : null}
            {data.cashPaid ? (
              <p className='text-zinc-400'>
                Cash paid <span className='font-mono text-emerald-300'>{data.cashPaid}</span>
              </p>
            ) : null}
            <p className='text-zinc-400'>
              Total paid <span className='font-mono text-emerald-300'>{data.totalPaid ?? '—'}</span>
            </p>
            <p className='text-zinc-400'>
              Balance due <span className='font-mono text-gold-soft'>{data.balanceDue}</span>
            </p>
            {data.paymentMethod ? <p className='text-zinc-400'>Status: {data.paymentMethod}</p> : null}
            {data.technicianName ? <p className='text-zinc-400'>Tech: {data.technicianName}</p> : null}
          </div>
        </WorkOrderCollapsible>

        <WorkOrderCollapsible title='Customer & address'>
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
            <button type='submit' className='scroll-mt-32 sm:col-span-2 rounded-2xl border border-gold/40 px-4 py-3 text-xs font-black uppercase text-gold-soft'>
              Save customer
            </button>
          </form>
        </WorkOrderCollapsible>

        <WorkOrderCollapsible title='Vehicles' badge={`${data.vehicles.length}`} defaultOpen>
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
        </WorkOrderCollapsible>

        <div id='photos'>
          <WorkOrderCollapsible title='Photos' defaultOpen badge={`${data.vehicles.length} vehicle${data.vehicles.length === 1 ? '' : 's'}`}>
            {(data.photosByVehicle?.length ? data.photosByVehicle : []).map((vg) => (
              <div key={vg.vehicleIndex} className='gb-premium-card mb-6 rounded-2xl border border-gold/20 bg-black/40 p-4'>
                <p className='text-base font-black text-white'>
                  Vehicle {vg.vehicleIndex + 1}: {vg.label}
                </p>
                {vg.service ? <p className='text-xs text-zinc-500'>{vg.service.replace(/-/g, ' ')}</p> : null}
                <WorkOrderGallery title='Before' photos={vg.before} canDelete={data.canDeletePhotos} />
                <WorkOrderGallery title='After' photos={vg.after} canDelete={data.canDeletePhotos} />
                <WorkOrderPhotoUpload
                  appointmentId={data.isFallback ? null : jobId}
                  fallbackBookingId={data.isFallback ? jobId : null}
                  workOrderId={data.canonicalId}
                  customerId={data.customerId}
                  workflowSessionId={data.workflowSessionId}
                  vehicleIndex={vg.vehicleIndex}
                  vehicleLabel={vg.label}
                />
              </div>
            ))}
          </WorkOrderCollapsible>
        </div>

        <WorkOrderCollapsible title='Payment' defaultOpen>
          {data.pricingBreakdown && data.pricingBreakdown.length > 0 ? (
            <ul className='mb-4 space-y-1.5 rounded-xl border border-gold/20 bg-black/40 p-3 text-sm'>
              {data.pricingBreakdown.map((line, i) => (
                <li
                  key={`${line.label}-${i}`}
                  className={`flex justify-between gap-2 ${line.tone === 'total' ? 'border-t border-white/15 pt-2 font-black text-white' : 'text-zinc-400'}`}
                >
                  <span>{line.label}</span>
                  <span className={`font-mono shrink-0 ${line.tone === 'discount' ? 'text-emerald-300' : 'text-zinc-200'}`}>
                    {line.amount}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <WorkOrderCustomCharges
            appointmentId={data.isFallback ? undefined : jobId}
            fallbackBookingId={data.isFallback ? jobId : undefined}
            source={data.isFallback ? 'fallback' : 'appointment'}
            items={data.customLineItems ?? []}
          />
          <ul className='mt-4 space-y-2 text-sm'>
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
          <div className='mt-4'>
            <WorkOrderBalanceCheckout
              appointmentId={jobId}
              balanceDueCents={data.balanceDueCents}
              balanceDue={data.balanceDue}
              finalTotal={data.finalTotal}
              depositPaid={data.depositPaid}
              totalPaid={data.totalPaid}
              paymentComplete={data.paymentComplete}
              isFallback={data.isFallback}
            />
          </div>
          <WorkOrderCollapsible title='Receipts & cash' defaultOpen={false}>
          <div className='grid gap-2 sm:grid-cols-2'>
            <form action={recordCashAction} className='grid gap-2'>
              {!data.isFallback ? <input type='hidden' name='appointmentId' value={jobId} /> : null}
              {data.isFallback ? <input type='hidden' name='fallbackBookingId' value={jobId} /> : null}
              <input name='amountReceived' placeholder='Cash received ($)' className='gb-input' />
              <button type='submit' className='rounded-2xl bg-emerald-500 px-4 py-3 text-xs font-black uppercase text-black'>
                Mark cash paid
              </button>
            </form>
            <ToastActionForm action={generateWorkOrderReceiptActionState} className='w-full'>
              {!data.isFallback ? <input type='hidden' name='appointmentId' value={jobId} /> : null}
              {data.isFallback ? <input type='hidden' name='fallbackBookingId' value={jobId} /> : null}
              <SubmitStatusButton
                pendingText='Generating…'
                className='w-full rounded-2xl border border-white/20 px-4 py-3 text-xs font-black uppercase text-zinc-200'
              >
                Generate receipt
              </SubmitStatusButton>
            </ToastActionForm>
            <ToastActionForm action={sendWorkOrderReceiptEmailAction} className='w-full'>
              {!data.isFallback ? <input type='hidden' name='appointmentId' value={jobId} /> : null}
              {data.isFallback ? <input type='hidden' name='fallbackBookingId' value={jobId} /> : null}
              <SubmitStatusButton
                pendingText='Sending…'
                className='w-full rounded-2xl border border-gold/35 px-4 py-3 text-xs font-black uppercase text-gold-soft'
              >
                Send receipt email
              </SubmitStatusButton>
            </ToastActionForm>
            {data.receiptPdfHref ? <ReceiptPdfDownloadButton href={data.receiptPdfHref} /> : null}
          </div>
          </WorkOrderCollapsible>
        </WorkOrderCollapsible>

        <WorkOrderCollapsible title='Agreement' defaultOpen={!data.agreementSigned}>
          <div className='flex flex-wrap gap-2'>
            <Link href={data.agreementCaptureHref} className='gb-premium-btn rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs font-black uppercase text-gold-soft'>
              Recapture
            </Link>
            <Link href={data.agreementDetailHref} className='gb-premium-btn rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black uppercase text-zinc-200'>
              View agreement
            </Link>
          </div>
        </WorkOrderCollapsible>

        <WorkOrderCollapsible title='Notes' badge={String(data.notes.length)} defaultOpen={false}>
          {data.notes.length === 0 ? <p className='text-sm text-zinc-500'>No notes yet.</p> : null}
          <ul className='space-y-3'>
            {data.notes.map((n) => (
              <li key={n.id} className='rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm'>
                <p className='text-[10px] font-bold uppercase text-gold-soft'>{n.vehicleLabel} · {n.time}</p>
                <p className='mt-1 whitespace-pre-wrap text-zinc-300'>{n.body}</p>
              </li>
            ))}
          </ul>
        </WorkOrderCollapsible>

        {!data.isFallback ? (
          <form action={completeJobAction} className='gb-premium-card space-y-3 rounded-2xl border border-gold/30 p-4'>
            <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Complete job</p>
            <input type='hidden' name='appointmentId' value={jobId} />
            {data.workflowSessionId ? <input type='hidden' name='workflowSessionId' value={data.workflowSessionId} /> : null}
            {canAdminOverride && !data.paymentComplete ? (
              <label className='flex cursor-pointer items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100'>
                <input type='checkbox' name='adminOverride' value='true' className='rounded border-amber-400' />
                Admin override — complete with balance due
              </label>
            ) : null}
            <button type='submit' className='gb-premium-btn flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-4 text-sm font-black uppercase text-black'>
              <CheckCircle2 className='h-5 w-5' /> Complete job
            </button>
          </form>
        ) : null}
      </section>

      <StickyActionBar>
        <Link href={data.agreementCaptureHref} className='flex-1 rounded-xl border border-gold/40 px-3 py-3 text-center text-[10px] font-black uppercase text-gold-soft'>
          Agreement
        </Link>
        <a href='#photos' className='flex-1 rounded-xl border border-white/20 px-3 py-3 text-center text-[10px] font-black uppercase text-zinc-200'>
          Photos
        </a>
        {data.balanceDueCents > 0 && !data.isFallback ? (
          <NotificationSendForm
            kind='payment_link'
            appointmentId={jobId}
            buttonClassName='flex-1 rounded-xl bg-gold px-3 py-3 text-center text-[10px] font-black uppercase text-black'
          >
            Balance link
          </NotificationSendForm>
        ) : null}
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

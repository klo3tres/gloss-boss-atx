'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, CreditCard, FileSignature } from 'lucide-react';
import { useMemo } from 'react';
import { PremiumBadge, ProgressTracker, SectionEyebrow, TimelineRail } from '@/components/ui/premium';
import { WorkOrderMissionBar } from '@/components/tech/work-order-mission-bar';
import { WorkOrderInvoiceBuilder, type InvoicePricingSnapshot } from '@/components/tech/work-order-invoice-builder';
import { WorkOrderReceiptPanel } from '@/components/tech/work-order-receipt-panel';
import { WorkOrderMileagePanel } from '@/components/tech/work-order-mileage-panel';
import type { ReceiptBreakdownLine } from '@/lib/receipt-breakdown';
import type { JobPricingDisplay } from '@/lib/job-pricing-display';
import { TechTimerControls } from '@/app/(dashboard)/tech/tech-timer-controls';
import { WorkOrderPhotoUpload } from '@/app/(dashboard)/tech/work-order-photo-upload';
import { WorkOrderCompletePanel } from '@/components/tech/work-order-complete-panel';
import { WorkOrderGallery, type WorkOrderGalleryPhoto } from '@/app/(dashboard)/tech/work-order-gallery';
import { WorkOrderVehiclesForm } from '@/components/tech/work-order-vehicles-form';
import { WorkOrderCollapsible } from '@/components/tech/work-order-collapsible';
import { WorkOrderPreInspection } from '@/components/tech/work-order-pre-inspection';
import { WorkOrderPricingPanel } from '@/components/tech/work-order-pricing-panel';
import { WorkOrderSchedulePanel } from '@/components/tech/work-order-schedule-panel';
import type { RequiredBeforeSlot } from '@/lib/pre-inspection';

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
  scheduledStartIso?: string;
  promoCode?: string;
  pricingOverrideReason?: string;
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
  recentPayments: Array<{
    id?: string;
    amount: string;
    amountCents?: number;
    status: string;
    method: string;
    at: string;
    voided?: boolean;
    stripe?: string;
  }>;
  receiptPdfHref?: string;
  receiptBreakdownLines?: ReceiptBreakdownLine[];
  photoUploadDisabled?: boolean;
  photoUploadDisableReason?: string;
  photoUploadResolvedContext?: boolean;
  uploadContextDebug?: {
    workOrderId: string;
    appointmentId: string;
    fallbackBookingId: string;
    workflowSessionId: string;
    customerId: string;
    urlParamId: string;
    source?: string;
    uploadEnabled?: boolean;
    disableReason?: string;
    partialLoad?: boolean;
  };
  canManagePayments?: boolean;
  workOrderPath?: string;
  customerId?: string;
  customLineItems?: Array<{ id: string; label: string; kind?: string; amountCents: number; quantity?: number; notes?: string }>;
  pricingSnapshot?: InvoicePricingSnapshot;
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
  preInspection?: {
    photoProgress: string;
    slotFilled: Record<RequiredBeforeSlot, boolean>;
    beforePhotosBySlot?: Record<
      string,
      { id: string; url: string; table?: 'job_media' | 'job_photos'; storagePath?: string; storageBucket?: string }
    >;
    canDeletePhotos?: boolean;
    missingStartItems: string[];
    canStartJob: boolean;
    isJobStarted: boolean;
    preInspectionOverridden: boolean;
    damageAck: {
      damageNotes: string;
      noVisibleDamage: boolean;
      customerAcknowledged: boolean;
      customerSignatureName: string;
      witnessName: string;
      acknowledgedAt: string;
      damageAckComplete: boolean;
    };
    vehicleIndex: number;
    vehicleLabel: string;
    serviceSlug: string;
    technicianName: string;
  };
};

export function WorkOrderConsoleClient({
  data,
  updateDetailsAction,
  updateVehiclesAction,
  recordCashAction,
  completeJobAction,
  canAdminOverride = false,
  canEditPricing = false,
}: {
  data: WorkOrderConsoleData;
  updateDetailsAction: (formData: FormData) => void | Promise<void>;
  updateVehiclesAction: (formData: FormData) => void | Promise<void>;
  recordCashAction: (formData: FormData) => void | Promise<void>;
  completeJobAction: (formData: FormData) => void | Promise<void>;
  canAdminOverride?: boolean;
  canEditPricing?: boolean;
}) {
  const progressPct = useMemo(() => {
    const ok = data.requirements.filter((r) => r.ok).length;
    return data.requirements.length ? Math.round((ok / data.requirements.length) * 100) : 0;
  }, [data.requirements]);

  const jobId = data.canonicalId;

  const vehicleLine = data.vehicles.map((v) => v.label).join(' · ') || data.serviceLabel;

  return (
    <div className='gb-page-pad gb-wo-mission-pad space-y-5 pb-24 md:space-y-6'>
      <WorkOrderMissionBar
        guestPhone={data.guestPhone}
        mapsHref={data.mapsHref}
        hasPreInspection={Boolean(data.preInspection)}
        timerRunning={Boolean(data.openTimerId)}
      />
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
        <p className='mt-2 text-sm font-semibold text-gold-soft'>{vehicleLine}</p>
        {data.fullAddress ? (
          <p className='mt-1 text-sm text-zinc-400'>{data.fullAddress}</p>
        ) : null}
        <p className='mt-2 text-sm text-zinc-500'>
          {data.scheduledStart || 'Schedule TBD'}
          {data.scheduledEnd ? ` → ${data.scheduledEnd}` : ''}
          {data.technicianName ? ` · ${data.technicianName}` : ''}
        </p>
        <div className='gb-mission-metrics mt-6'>
          <div className='gb-glass rounded-2xl border border-gold/25 px-4 py-3'>
            <p className='text-[9px] font-black uppercase text-zinc-500'>Final total</p>
            <p className='mt-1 font-mono text-lg font-bold text-gold-soft'>{data.finalTotal ?? data.baseSubtotal}</p>
          </div>
          <div className='gb-glass rounded-2xl border border-white/10 px-4 py-3'>
            <p className='text-[9px] font-black uppercase text-zinc-500'>Balance</p>
            <p className='mt-1 font-mono text-lg font-bold text-white'>{data.balanceDue}</p>
          </div>
          <div className='gb-glass rounded-2xl border border-white/10 px-4 py-3'>
            <p className='text-[9px] font-black uppercase text-zinc-500'>Paid</p>
            <p className='mt-1 font-mono text-lg font-bold text-emerald-300'>{data.totalPaid ?? '—'}</p>
          </div>
          <div className='gb-glass rounded-2xl border border-white/10 px-4 py-3'>
            <p className='text-[9px] font-black uppercase text-zinc-500'>Progress</p>
            <p className='mt-1 font-mono text-lg font-bold text-white'>{progressPct}%</p>
          </div>
        </div>
        <div className='mt-4 flex flex-wrap gap-2'>
          <Link href={data.shellBackHref} className='rounded-xl border border-white/15 px-4 py-2.5 text-[10px] font-black uppercase text-zinc-300'>
            ← Back
          </Link>
        </div>
        <div className='mt-6'>
          <ProgressTracker steps={data.requirements} />
        </div>
      </motion.section>

      <section id='wo-agreement' className='scroll-mt-28'>
        <WorkOrderCollapsible
          title='Agreement & acknowledgement'
          defaultOpen={!data.agreementSigned}
          badge={data.agreementSigned ? 'Signed' : 'Required'}
        >
          <p className='text-sm text-zinc-400'>
            {data.agreementSigned
              ? 'Legal acknowledgement is on file for this job.'
              : 'Capture acknowledgement before field work — this is step 1 in job progress.'}
          </p>
          <div className='mt-4 flex flex-wrap gap-2'>
            <Link
              href={data.agreementCaptureHref}
              className='gb-premium-btn rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs font-black uppercase text-gold-soft'
            >
              {data.agreementSigned ? 'Recapture agreement' : 'Capture agreement'}
            </Link>
            <Link
              href={data.agreementDetailHref}
              className='gb-premium-btn rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black uppercase text-zinc-200'
            >
              View agreement
            </Link>
          </div>
        </WorkOrderCollapsible>
      </section>

      <div id='wo-timer' className='scroll-mt-28 rounded-2xl border border-gold/25 bg-black/50 px-4 py-3 lg:sticky lg:top-2 lg:z-10 lg:bg-black/90 lg:backdrop-blur-md'>
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
        <WorkOrderCollapsible title='Job summary' defaultOpen={false}>
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

        <WorkOrderCollapsible title='Customer & address' defaultOpen={false}>
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

        <WorkOrderCollapsible title='Vehicles' badge={`${data.vehicles.length}`} defaultOpen={false}>
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

        {canAdminOverride && data.uploadContextDebug ? (
          <div className='rounded-xl border border-dashed border-gold/30 bg-zinc-950 px-4 py-3 font-mono text-[10px] text-zinc-400'>
            <p className='font-black uppercase text-gold-soft'>Upload context (admin)</p>
            <p className='mt-2'>
              Enabled: {data.uploadContextDebug.uploadEnabled ? 'yes' : 'no'}
              {data.uploadContextDebug.disableReason ? ` — ${data.uploadContextDebug.disableReason}` : ''}
            </p>
            <p>Source: {data.uploadContextDebug.source ?? '—'} · partial: {data.uploadContextDebug.partialLoad ? 'yes' : 'no'}</p>
            <p>WO {data.uploadContextDebug.workOrderId}</p>
            <p>Appt {data.uploadContextDebug.appointmentId || '—'} · FB {data.uploadContextDebug.fallbackBookingId || '—'}</p>
            <p>Session {data.uploadContextDebug.workflowSessionId || '—'} · customer {data.uploadContextDebug.customerId || '—'}</p>
          </div>
        ) : null}

        {data.preInspection ? (
          <div id='wo-preinspect' className='scroll-mt-28'>
          <WorkOrderCollapsible title='Pre-inspection & checklist' defaultOpen badge={data.preInspection.photoProgress}>
            <WorkOrderPreInspection
              appointmentId={data.isFallback ? null : jobId}
              fallbackBookingId={data.isFallback ? jobId : null}
              workOrderId={jobId}
              customerId={data.customerId}
              workflowSessionId={data.workflowSessionId}
              photoUploadDisabled={data.photoUploadDisabled}
              agreementSigned={data.agreementSigned}
              canAdminOverride={canAdminOverride}
              checklistSaved={data.requirements.find((r) => r.label.startsWith('Checklist'))?.ok ?? false}
              jobStatus={data.job.status}
              {...data.preInspection}
            />
          </WorkOrderCollapsible>
          </div>
        ) : null}

        <div id='wo-photos' className='scroll-mt-28'>
          <WorkOrderCollapsible title='Photos & gallery' defaultOpen badge={`${data.vehicles.length} vehicle${data.vehicles.length === 1 ? '' : 's'}`}>
            {data.photoUploadDisabled ? (
              <p className='mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100'>
                {data.photoUploadDisableReason ?? 'Photo upload disabled for archived/test/orphan job.'}
              </p>
            ) : null}
            {(data.photosByVehicle?.length ? data.photosByVehicle : []).map((vg) => (
              <div key={vg.vehicleIndex} className='gb-premium-card mb-6 rounded-2xl border border-gold/20 bg-black/40 p-4'>
                <p className='text-base font-black text-white'>
                  Vehicle {vg.vehicleIndex + 1}: {vg.label}
                </p>
                {vg.service ? <p className='text-xs text-zinc-500'>{vg.service.replace(/-/g, ' ')}</p> : null}
                <WorkOrderGallery title='Before' photos={vg.before} canDelete={data.canDeletePhotos} />
                <WorkOrderGallery title='After' photos={vg.after} canDelete={data.canDeletePhotos} />
                {!data.photoUploadDisabled ? (
                  <WorkOrderPhotoUpload
                    appointmentId={data.isFallback ? null : jobId}
                    fallbackBookingId={data.isFallback ? jobId : null}
                    workOrderId={data.canonicalId}
                    customerId={data.customerId}
                    workflowSessionId={data.workflowSessionId}
                    source={data.isFallback ? 'fallback' : 'appointment'}
                    resolvedContextTrust={data.photoUploadResolvedContext}
                    vehicleIndex={vg.vehicleIndex}
                    vehicleLabel={vg.label}
                  />
                ) : null}
              </div>
            ))}
          </WorkOrderCollapsible>
        </div>

        {canEditPricing && data.pricingSnapshot ? (
          <WorkOrderPricingPanel
            appointmentId={data.isFallback ? undefined : jobId}
            fallbackBookingId={data.isFallback ? jobId : undefined}
            source={data.isFallback ? 'fallback' : 'appointment'}
            vehicles={data.vehicles.map((v, index) => ({
              index,
              label: v.label,
              service: v.service.replace(/-/g, ' '),
              priceCents: v.priceCents,
              priceLabel: v.priceLabel,
            }))}
            promoCode={data.promoCode ?? ''}
            pricing={{
              finalTotalCents: data.pricingSnapshot.finalTotalCents,
              onlineDiscountCents: data.pricingSnapshot.onlineDiscountCents,
              multiCarDiscountCents: data.pricingSnapshot.multiCarDiscountCents,
              promoDiscountCents: data.pricingSnapshot.promoDiscountCents,
              overrideReason: data.pricingOverrideReason,
            }}
          />
        ) : null}

        {canEditPricing && !data.isFallback && data.scheduledStartIso ? (
          <WorkOrderSchedulePanel appointmentId={jobId} scheduledStart={data.scheduledStartIso} scheduledEnd={data.scheduledEnd} />
        ) : null}

        <div id='wo-payment' className='scroll-mt-28'>
        <WorkOrderCollapsible title='Payment & invoice' defaultOpen>
          <div id='wo-invoice'>
          {data.pricingSnapshot ? (
            <WorkOrderInvoiceBuilder
              jobId={jobId}
              customerName={data.guestName}
              vehicleBreakdownLines={(data.receiptBreakdownLines ?? [])
                .filter((l) => l.label !== 'Customer' && !['Final total', 'Balance due', 'Deposit paid', 'Total paid', 'Stripe paid', 'Zelle / Venmo paid', 'Manual / check paid', 'Cash paid'].includes(l.label) && !l.label.startsWith('Multi-car') && !l.label.startsWith('Online') && !l.label.startsWith('Promo') && l.label !== 'Manual discount')
                .map((l) => ({ label: l.label, amount: l.amount }))}
              appointmentId={data.isFallback ? undefined : jobId}
              fallbackBookingId={data.isFallback ? jobId : undefined}
              source={data.isFallback ? 'fallback' : 'appointment'}
              isFallback={data.isFallback}
              savedItems={data.customLineItems ?? []}
              pricing={data.pricingSnapshot}
              balanceDue={data.balanceDue}
              balanceDueCents={data.balanceDueCents}
              finalTotal={data.finalTotal}
              depositPaid={data.depositPaid}
              totalPaid={data.totalPaid}
              paymentComplete={data.paymentComplete}
              receiptPdfHref={data.receiptPdfHref}
              defaultVehicleClass={
                (data.vehicles[0]?.vehicleClass === 'suv' || data.vehicles[0]?.vehicleClass === 'truck'
                  ? data.vehicles[0].vehicleClass
                  : 'sedan') as 'sedan' | 'suv' | 'truck'
              }
            />
          ) : (
            <p className='rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100'>
              Pricing data unavailable — refresh the page.
            </p>
          )}
          </div>
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
          <WorkOrderCollapsible title='Cash payment' defaultOpen={false}>
            <form action={recordCashAction} className='grid max-w-md gap-2'>
              {!data.isFallback ? <input type='hidden' name='appointmentId' value={jobId} /> : null}
              {data.isFallback ? <input type='hidden' name='fallbackBookingId' value={jobId} /> : null}
              <input name='amountReceived' placeholder='Cash received ($)' className='gb-input' />
              <button type='submit' className='rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black uppercase text-black'>
                Mark cash paid
              </button>
            </form>
          </WorkOrderCollapsible>
          {!data.isFallback ? (
            <WorkOrderMileagePanel
              appointmentId={jobId}
              workOrderPath={data.workOrderPath ?? `/tech/work-orders/${jobId}`}
            />
          ) : null}
          <div id='wo-receipt'>
          {data.canManagePayments && data.pricingSnapshot && data.receiptBreakdownLines ? (
            <WorkOrderReceiptPanel
              appointmentId={data.isFallback ? undefined : jobId}
              fallbackBookingId={data.isFallback ? jobId : undefined}
              receiptPdfHref={data.receiptPdfHref}
              pricing={
                {
                  ...data.pricingSnapshot,
                  promoCode: data.promoCode ?? '',
                  rawTotalPaidCents: data.pricingSnapshot.rawTotalPaidCents ?? data.pricingSnapshot.totalPaidCents,
                  allocatedTotalPaidCents: data.pricingSnapshot.totalPaidCents,
                  overpaymentCents: data.pricingSnapshot.overpaymentCents ?? 0,
                  hasOverpayment: (data.pricingSnapshot.overpaymentCents ?? 0) > 0,
                } as JobPricingDisplay
              }
              breakdownLines={data.receiptBreakdownLines}
              payments={data.recentPayments.map((p) => ({
                id: p.id ?? '',
                amount: p.amount,
                amountCents: p.amountCents ?? 0,
                status: p.status,
                method: p.method,
                at: p.at,
                voided: p.voided,
              }))}
              promoCode={data.promoCode}
              canManagePayments
              workOrderPath={data.workOrderPath ?? `/tech/work-orders/${jobId}`}
            />
          ) : null}
          </div>
        </WorkOrderCollapsible>
        </div>

        <div id='wo-timeline' className='scroll-mt-28'>
        <WorkOrderCollapsible title='Timeline & notifications' defaultOpen={false} badge={String(data.timeline.length)}>
          <TimelineRail events={data.timeline} />
          {data.outbox.length > 0 ? (
            <ul className='mt-4 space-y-2 text-xs text-zinc-400'>
              {data.outbox.map((o) => (
                <li key={o.id} className='rounded-lg border border-white/10 px-3 py-2'>
                  {o.kind} · {o.status} · {o.time}
                  {o.skipped ? ` · ${o.skipped}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </WorkOrderCollapsible>
        </div>

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

        <WorkOrderCompletePanel
          jobId={jobId}
          isFallback={data.isFallback}
          workflowSessionId={data.workflowSessionId}
          canAdminOverride={canAdminOverride}
          paymentComplete={data.paymentComplete}
          balanceDueCents={data.balanceDueCents}
          guestEmail={data.guestEmail}
          agreementCaptureHref={data.agreementCaptureHref}
        />
      </section>

    </div>
  );
}

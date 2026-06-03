'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, CreditCard, FileSignature } from 'lucide-react';
import { useMemo } from 'react';
import { PremiumBadge, ProgressTracker, SectionEyebrow, TimelineRail } from '@/components/ui/premium';
import { WorkOrderMissionBar } from '@/components/tech/work-order-mission-bar';
import { type InvoicePricingSnapshot } from '@/components/tech/work-order-invoice-builder';
import { WorkOrderLedgerPanel, type LedgerDiscountRow, type LedgerPaymentRow } from '@/components/tech/work-order-ledger-panel';
import { WorkOrderMileagePanel } from '@/components/tech/work-order-mileage-panel';
import type { ReceiptBreakdownLine } from '@/lib/receipt-breakdown';
import type { ReceiptParityDebug } from '@/lib/receipt-totals';
import type { JobPricingDisplay } from '@/lib/job-pricing-display';
import { TechTimerControls } from '@/app/(dashboard)/tech/tech-timer-controls';
import { WorkOrderPhotoUpload } from '@/app/(dashboard)/tech/work-order-photo-upload';
import { WorkOrderCompletePanel } from '@/components/tech/work-order-complete-panel';
import { WorkOrderGallery, type WorkOrderGalleryPhoto } from '@/app/(dashboard)/tech/work-order-gallery';
import { WorkOrderVehiclesForm } from '@/components/tech/work-order-vehicles-form';
import { WorkOrderCollapsible } from '@/components/tech/work-order-collapsible';
import { WorkOrderPreInspection } from '@/components/tech/work-order-pre-inspection';
import { WorkOrderSchedulePanel } from '@/components/tech/work-order-schedule-panel';
import { AppointmentScheduleControls } from '@/components/admin/appointment-schedule-controls';
import { WorkOrderSectionTabs } from '@/components/tech/work-order-section-tabs';
import type { RequiredBeforeSlot } from '@/lib/pre-inspection';

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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
  ledgerResolveError?: string | null;
  receiptParityDebug?: ReceiptParityDebug;
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
  jobPricing?: JobPricingDisplay;
  ledgerDiscounts?: LedgerDiscountRow[];
  ledgerPayments?: LedgerPaymentRow[];
  ledgerWarnings?: string[];
  ledgerTotals?: {
    serviceSubtotal: string;
    addOnSubtotal: string;
    grossSubtotal: string;
    totalDiscounts: string;
    finalTotal: string;
    totalPaid: string;
    balanceDue: string;
  };
  orderSourceLabel?: string;
  isTestOrder?: boolean;
  stripeSessionId?: string;
  stripePaymentIntent?: string;
  canAdvancedRepair?: boolean;
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

  // Calculate actual vs expected duration
  const dur = useMemo(() => {
    if (!data.jobStartedAt) return null;
    const start = new Date(data.jobStartedAt).getTime();
    const end = data.jobCompletedAt ? new Date(data.jobCompletedAt).getTime() : Date.now();
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    const diffMins = Math.round((end - start) / 60000);
    return {
      minutes: diffMins,
      label: data.jobCompletedAt ? 'Actual duration' : 'Elapsed time',
    };
  }, [data.jobStartedAt, data.jobCompletedAt]);

  const expectedMins = useMemo(() => {
    if (!data.scheduledStartIso || !data.scheduledEnd) return null;
    const start = new Date(data.scheduledStartIso).getTime();
    const end = new Date(data.scheduledEnd).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    return Math.round((end - start) / 60000);
  }, [data.scheduledStartIso, data.scheduledEnd]);

  return (
    <div className='gb-page-pad gb-wo-mission-pad space-y-5 pb-24 md:space-y-6'>
      <WorkOrderMissionBar
        guestPhone={data.guestPhone}
        mapsHref={data.mapsHref}
        hasPreInspection={Boolean(data.preInspection)}
        timerRunning={Boolean(data.openTimerId)}
      />

      {/* Luxury Process Stepper */}
      <div className="gb-glass rounded-3xl border border-white/10 p-6 bg-black/40">
        <SectionEyebrow>Operations pipeline</SectionEyebrow>
        <div className="mt-6 relative flex items-center justify-between">
          {/* Connector Line */}
          <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-white/5" />
          <div 
            className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-gold transition-all duration-500" 
            style={{
              width: `${
                data.paymentComplete ? '100%' :
                data.jobCompletedAt || data.statusLabel.toLowerCase().includes('complete') ? '75%' :
                data.job.status === 'in_progress' || data.openTimerId ? '50%' :
                data.agreementSigned ? '25%' : '0%'
              }`
            }}
          />
          
          {/* Stepper Nodes */}
          {[
            { label: 'Agreement', ok: data.agreementSigned },
            { label: 'Pre-Inspect', ok: data.preInspection?.damageAck.damageAckComplete || (data.agreementSigned && data.job.status !== 'confirmed' && data.job.status !== 'pending') },
            { label: 'In Progress', ok: data.job.status === 'in_progress' || Boolean(data.openTimerId) || data.statusLabel.toLowerCase().includes('complete') },
            { label: 'Completed', ok: data.statusLabel.toLowerCase().includes('complete') || Boolean(data.jobCompletedAt) },
            { label: 'Paid', ok: data.paymentComplete },
          ].map((step, idx) => {
            const isOk = step.ok;
            return (
              <div key={idx} className="relative z-10 flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-300 ${
                    isOk
                      ? 'border-gold bg-black text-gold shadow-[0_0_12px_rgba(212,175,55,0.4)]'
                      : 'border-white/10 bg-zinc-950 text-zinc-500'
                  }`}
                >
                  {isOk ? '✓' : idx + 1}
                </div>
                <span className={`mt-2 text-[9px] font-black uppercase tracking-wider ${isOk ? 'text-gold-soft' : 'text-zinc-500'}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <motion.section
        id='wo-overview'
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className='gb-invoice-card gb-premium-hero scroll-mt-36 rounded-3xl px-5 py-6 sm:px-8 sm:py-8'
      >
        <div className='flex flex-wrap gap-2'>
          <PremiumBadge tone='gold'>WO #{data.canonicalId.slice(0, 8).toUpperCase()}</PremiumBadge>
          <PremiumBadge tone='zinc'>{data.statusLabel}</PremiumBadge>
          <PremiumBadge tone={data.agreementSigned ? 'emerald' : 'amber'}>
            <FileSignature className='h-3 w-3' />
            {data.agreementSigned ? 'Signed' : 'Agreement'}
          </PremiumBadge>
          <PremiumBadge tone={data.paymentComplete ? 'emerald' : 'amber'}>
            <CreditCard className='h-3 w-3' />
            {data.paymentComplete ? 'Paid' : data.paymentStatus}
          </PremiumBadge>
        </div>
        <h1 className='mt-4 text-2xl font-black text-white sm:text-4xl'>
          <span className='block text-[10px] font-black uppercase tracking-[0.35em] text-zinc-500'>Work order</span>
          <span className='mt-1 block'>{data.guestName}</span>
        </h1>
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
          <div className='gb-premium-card rounded-2xl border border-gold/30 px-4 py-3.5 shadow-[0_0_15px_rgba(212,175,55,0.08)] backdrop-blur-sm'>
            <p className='text-[9px] font-black uppercase tracking-wider text-zinc-400'>Final total</p>
            <p className='mt-1 font-mono text-lg font-black text-gold-soft'>{data.finalTotal ?? data.baseSubtotal}</p>
          </div>
          <div className='gb-premium-card rounded-2xl border border-white/10 px-4 py-3.5 shadow-md backdrop-blur-sm hover:border-gold/15 transition duration-300'>
            <p className='text-[9px] font-black uppercase tracking-wider text-zinc-400'>Balance</p>
            <p className='mt-1 font-mono text-lg font-black text-white'>{data.balanceDue}</p>
          </div>
          <div className='gb-premium-card rounded-2xl border border-white/10 px-4 py-3.5 shadow-md backdrop-blur-sm hover:border-gold/15 transition duration-300'>
            <p className='text-[9px] font-black uppercase tracking-wider text-zinc-400'>Paid</p>
            <p className='mt-1 font-mono text-lg font-black text-emerald-300'>{data.totalPaid ?? '—'}</p>
          </div>
          <div className='gb-premium-card rounded-2xl border border-white/10 px-4 py-3.5 shadow-md backdrop-blur-sm hover:border-gold/15 transition duration-300'>
            <p className='text-[9px] font-black uppercase tracking-wider text-zinc-400'>Progress</p>
            <p className='mt-1 font-mono text-lg font-black text-white'>{progressPct}%</p>
          </div>
        </div>
        <div className='mt-4 flex flex-wrap gap-2'>
          <Link href={data.shellBackHref} className='rounded-xl border border-white/20 bg-black/40 px-5 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:bg-white/5 transition duration-200'>
            ← Back
          </Link>
          <button
            type='button'
            onClick={() => scrollToSection('wo-timer')}
            className='gb-premium-btn rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-5 py-3 text-[10px] font-black uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/15 shadow-[0_0_15px_rgba(16,185,129,0.1)] transition duration-200'
          >
            Timer
          </button>
          <button
            type='button'
            onClick={() => scrollToSection('wo-complete')}
            className='gb-premium-btn rounded-xl border border-gold/45 bg-gold/10 px-5 py-3 text-[10px] font-black uppercase tracking-wider text-gold-soft hover:bg-gold/15 shadow-[0_0_15px_rgba(212,175,55,0.1)] transition duration-200'
          >
            Mark complete
          </button>
        </div>
        <div className='mt-6'>
          <ProgressTracker steps={data.requirements} />
        </div>
      </motion.section>

      <WorkOrderSectionTabs />

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
              <div key={vg.vehicleIndex} className='gb-premium-card mb-6 rounded-2xl border border-gold/20 bg-black/40 p-5 space-y-4'>
                <div>
                  <p className='text-base font-black text-white'>
                    Vehicle {vg.vehicleIndex + 1}: {vg.label}
                  </p>
                  {vg.service ? <p className='text-xs text-zinc-500'>{vg.service.replace(/-/g, ' ')}</p> : null}
                </div>
                
                {/* Comparative Photos Timeline */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="gb-glass bg-zinc-950/40 rounded-xl p-3 border border-white/5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-200 mb-2">Before Restoration</p>
                    <WorkOrderGallery title="" photos={vg.before} canDelete={data.canDeletePhotos} />
                  </div>
                  <div className="gb-glass bg-zinc-950/40 rounded-xl p-3 border border-white/5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300 mb-2">After Restoration</p>
                    <WorkOrderGallery title="" photos={vg.after} canDelete={data.canDeletePhotos} />
                  </div>
                </div>

                {!data.photoUploadDisabled ? (
                  <div className="pt-2">
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
                  </div>
                ) : null}
              </div>
            ))}
          </WorkOrderCollapsible>
        </div>

        <div id='wo-timer' className='scroll-mt-28 rounded-2xl border border-gold/25 bg-black/50 px-4 py-3'>
          <div className='flex items-center justify-between border-b border-white/5 pb-2 mb-3'>
            <div className='flex items-center gap-2'>
              <Clock className='h-4 w-4 text-gold-soft' />
              <SectionEyebrow>Timer & duration</SectionEyebrow>
            </div>
            {dur && (
              <div className='flex items-center gap-2 text-[10px] font-mono'>
                <span className='text-zinc-400'>{dur.label}: <strong className='text-white'>{dur.minutes}m</strong></span>
                {expectedMins && (
                  <>
                    <span className='text-zinc-600'>|</span>
                    <span className='text-zinc-400'>Expected: <strong className='text-white'>{expectedMins}m</strong></span>
                  </>
                )}
              </div>
            )}
          </div>
          <TechTimerControls
            appointmentId={data.isFallback ? null : jobId}
            fallbackBookingId={data.isFallback ? jobId : null}
            workflowSessionId={data.workflowSessionId}
            initialTimerId={data.openTimerId || null}
            initialStartedAt={data.openTimerStartedAt || null}
          />
        </div>

        {canEditPricing && !data.isFallback && data.scheduledStartIso ? (
          <WorkOrderSchedulePanel appointmentId={jobId} scheduledStart={data.scheduledStartIso} scheduledEnd={data.scheduledEnd} />
        ) : null}
        {canAdminOverride && !data.isFallback && data.source === 'appointment' ? (
          <AppointmentScheduleControls appointmentId={jobId} scheduledStart={data.scheduledStartIso} />
        ) : null}

        <div id='wo-payment' className='scroll-mt-28'>
        <WorkOrderCollapsible title='Money & receipt' defaultOpen>
          {data.ledgerResolveError ? (
            <p className='rounded-xl border border-red-500/40 bg-red-950/50 px-4 py-3 text-sm text-red-100'>{data.ledgerResolveError}</p>
          ) : null}
          {data.pricingSnapshot && data.jobPricing && data.receiptBreakdownLines && data.ledgerDiscounts && data.ledgerPayments && !data.ledgerResolveError ? (
            <WorkOrderLedgerPanel
              jobId={jobId}
              isFallback={data.isFallback}
              source={data.isFallback ? 'fallback' : 'appointment'}
              appointmentId={data.isFallback ? undefined : jobId}
              fallbackBookingId={data.isFallback ? jobId : undefined}
              orderSourceLabel={data.orderSourceLabel ?? 'Work order'}
              isTest={data.isTestOrder}
              vehicles={data.vehicles.map((v, index) => ({
                index,
                label: v.label,
                service: v.service,
                priceCents: v.priceCents,
                priceLabel: v.priceLabel,
              }))}
              discounts={data.ledgerDiscounts}
              payments={data.ledgerPayments}
              pricingSnapshot={data.pricingSnapshot}
              pricing={data.jobPricing!}
              breakdownLines={data.receiptBreakdownLines}
              balanceDue={data.balanceDue}
              balanceDueCents={data.balanceDueCents}
              finalTotal={data.finalTotal}
              depositPaid={data.depositPaid}
              totalPaid={data.totalPaid}
              paymentComplete={data.paymentComplete}
              receiptPdfHref={data.receiptPdfHref}
              customLineItems={data.customLineItems ?? []}
              promoCode={data.promoCode}
              pricingOverrideReason={data.pricingOverrideReason}
              canEditPricing={canEditPricing}
              canManagePayments={Boolean(data.canManagePayments)}
              canAdvancedRepair={Boolean(data.canAdvancedRepair)}
              workOrderPath={data.workOrderPath}
              customerName={data.guestName}
              recordCashAction={recordCashAction}
              stripeSessionId={data.stripeSessionId}
              stripePaymentIntent={data.stripePaymentIntent}
              ledgerWarnings={data.ledgerWarnings}
              ledgerTotals={data.ledgerTotals}
              receiptParityDebug={data.receiptParityDebug}
              recentPaymentsForRepair={data.recentPayments.map((p) => ({
                id: p.id ?? '',
                amount: p.amount,
                method: p.method,
                status: p.status,
                stripeSession: p.stripe,
              }))}
            />
          ) : !data.ledgerResolveError ? (
            <p className='rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100'>
              Order ledger unavailable — refresh the page.
            </p>
          ) : null}
          {!data.isFallback ? (
            <WorkOrderMileagePanel
              appointmentId={jobId}
              workOrderPath={data.workOrderPath ?? `/tech/work-orders/${jobId}`}
            />
          ) : null}
        </WorkOrderCollapsible>
        </div>

        <div id='wo-timeline' className='scroll-mt-28'>
        <WorkOrderCollapsible title='Timeline & notifications' defaultOpen={false} badge={String(data.timeline.length)}>
          <TimelineRail events={data.timeline} />
          {data.outbox.length > 0 ? (
            <div className="mt-6 pt-4 border-t border-white/5 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Outbox History</p>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {data.outbox.map((o) => {
                  const isEmail = String(o.kind).toLowerCase().includes('email');
                  const isSent = String(o.status).toLowerCase().includes('sent') || String(o.status).toLowerCase().includes('delivered');
                  return (
                    <div
                      key={o.id}
                      className="flex items-center justify-between rounded-xl border border-white/5 bg-zinc-950/40 px-3.5 py-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base text-zinc-400 shrink-0">
                          {isEmail ? '✉' : '🗪'}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white uppercase tracking-wide">
                            {o.kind}
                          </p>
                          <p className="text-[9px] text-zinc-500 mt-0.5">{o.time}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                            isSent
                              ? 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                              : 'border border-amber-500/25 bg-amber-500/10 text-amber-200'
                          }`}
                        >
                          {o.status}
                        </span>
                        {o.skipped ? (
                          <p className="text-[9px] text-zinc-500 mt-0.5 italic">{o.skipped}</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </WorkOrderCollapsible>
        </div>

        <div id='wo-notes' className='scroll-mt-32'>
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
        </div>

        <div id='wo-complete' className='scroll-mt-32'>
        <WorkOrderCompletePanel
          jobId={jobId}
          isFallback={data.isFallback}
          workflowSessionId={data.workflowSessionId}
          canAdminOverride={canAdminOverride}
          paymentComplete={data.paymentComplete}
          balanceDueCents={data.balanceDueCents}
          guestEmail={data.guestEmail}
          agreementCaptureHref={data.agreementCaptureHref}
          receiptPdfHref={data.receiptPdfHref}
          jobCompleted={data.statusLabel.toLowerCase().includes('complete') || Boolean(data.jobCompletedAt)}
        />
        </div>
      </section>

    </div>
  );
}

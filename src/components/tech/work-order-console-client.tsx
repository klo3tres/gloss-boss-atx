'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, CreditCard, FileSignature, Calendar, XCircle, PhoneCall, Copy, Check, MapPin, User, CheckCircle2 } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { PremiumBadge, ProgressTracker, SectionEyebrow, TimelineRail } from '@/components/ui/premium';
import { WorkOrderMissionBar } from '@/components/tech/work-order-mission-bar';
import { type InvoicePricingSnapshot } from '@/components/tech/work-order-invoice-builder';
import { WorkOrderLedgerPanel, type LedgerDiscountRow, type LedgerPaymentRow } from '@/components/tech/work-order-ledger-panel';
import { WorkOrderMileagePanel } from '@/components/tech/work-order-mileage-panel';
import type { ReceiptBreakdownLine } from '@/lib/receipt-breakdown';
import type { ReceiptParityDebug } from '@/lib/receipt-totals';
import { ReceiptLedgerDebugPanel } from '@/components/admin/receipt-ledger-debug-panel';
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
import { cancelWorkOrderAction } from '@/app/(dashboard)/tech/work-order-pre-inspection-actions';
import { techSendCustomSmsAction } from '@/app/(dashboard)/tech/tech-actions';
import { addManualLoyaltyStampAction, deleteLoyaltyStampAction } from '@/app/(dashboard)/admin/customer-actions';

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (el) {
    const yOffset = -120; // Adjust for fixed mission bar and sticky headers
    const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
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
  loyaltyStampsCount?: number;
  loyaltyStamps?: any[];
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
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [isContactOpen, setIsContactOpen] = useState(false);

  const [copiedAddress, setCopiedAddress] = useState(false);
  const handleCopyAddress = () => {
    navigator.clipboard.writeText(data.fullAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const [beforeAfterVehicle, setBeforeAfterVehicle] = useState<any | null>(null);
  const [selectedBeforePhoto, setSelectedBeforePhoto] = useState<string | null>(null);
  const [selectedAfterPhoto, setSelectedAfterPhoto] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState('');
  const [useWatermark, setUseWatermark] = useState(true);
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [creatingPost, setCreatingPost] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);

  const handleOpenBeforeAfterModal = (vg: any) => {
    setBeforeAfterVehicle(vg);
    setSelectedBeforePhoto(vg.before[0]?.url || null);
    setSelectedAfterPhoto(vg.after[0]?.url || null);
    const serviceName = (vg.service || '').replace(/-/g, ' ').replace(/\b\w/g, (m: string) => m.toUpperCase());
    setPostTitle(`${vg.label} · ${serviceName || data.serviceLabel}`);
    setUseWatermark(true);
    setPublishImmediately(true);
    setPostError(null);
    setPostSuccess(null);
  };

  const handleCreateBeforeAfterPost = async () => {
    if (!selectedBeforePhoto || !selectedAfterPhoto || !postTitle.trim()) return;
    setCreatingPost(true);
    setPostError(null);
    setPostSuccess(null);
    try {
      const response = await fetch('/api/admin/gallery/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'create-before-after',
          beforeUrl: selectedBeforePhoto,
          afterUrl: selectedAfterPhoto,
          vehicleLabel: beforeAfterVehicle.label,
          serviceLabel: beforeAfterVehicle.service || data.serviceLabel,
          caption: postTitle,
          watermark: useWatermark,
          published: publishImmediately,
        }),
      });
      const resData = await response.json();
      if (!response.ok || !resData.ok) {
        setPostError(resData.error || 'Failed to create post');
      } else {
        setPostSuccess('Before/After post created successfully!');
        setTimeout(() => {
          setBeforeAfterVehicle(null);
        }, 1500);
      }
    } catch (err: any) {
      setPostError(err.message || 'Failed to create post');
    } finally {
      setCreatingPost(false);
    }
  };

  const handleCancel = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await cancelWorkOrderAction(formData);
      if (res.error) {
        setCancelError(res.error);
      } else {
        setIsCancelModalOpen(false);
      }
    });
  };

  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [isMaintenanceConfirmOpen, setIsMaintenanceConfirmOpen] = useState(false);
  const [maintenancePitchText, setMaintenancePitchText] = useState('');
  const [sendingMaintenance, setSendingMaintenance] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [maintenanceSuccess, setMaintenanceSuccess] = useState<string | null>(null);

  const handleSendMaintenanceSms = async () => {
    setSendingMaintenance(true);
    setMaintenanceError(null);
    setMaintenanceSuccess(null);
    try {
      const formData = new FormData();
      if (!data.isFallback) {
        formData.set('appointmentId', jobId);
      } else {
        formData.set('fallbackBookingId', jobId);
      }
      formData.set('body', maintenancePitchText);
      formData.set('kind', 'maintenance_offer');

      const res = await techSendCustomSmsAction(formData);
      if (res.error) {
        setMaintenanceError(res.error);
      } else {
        setMaintenanceSuccess('Maintenance offer SMS sent!');
        setTimeout(() => {
          setIsMaintenanceConfirmOpen(false);
        }, 1500);
      }
    } catch (err: any) {
      setMaintenanceError(err.message || 'Failed to send SMS');
    } finally {
      setSendingMaintenance(false);
    }
  };

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

  const isCompleted = data.statusLabel.toLowerCase().includes('complete') || Boolean(data.jobCompletedAt);

  return (
    <div className='gb-page-pad gb-wo-mission-pad space-y-5 pb-24 md:space-y-6'>
      <WorkOrderMissionBar
        guestPhone={data.guestPhone}
        mapsHref={data.mapsHref}
        hasPreInspection={Boolean(data.preInspection)}
        timerRunning={Boolean(data.openTimerId)}
      />

      {isCompleted && (
        <div id='wo-complete-top' className='scroll-mt-36'>
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
            jobCompleted={true}
            onOfferMaintenancePlan={() => {
              setIsMaintenanceModalOpen(true);
            }}
          />
        </div>
      )}

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

      {/* Quick Actions Grid */}
      <div className="gb-glass rounded-3xl border border-white/10 p-6 bg-black/40 space-y-4">
        <SectionEyebrow>Quick actions</SectionEyebrow>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <button
            type="button"
            onClick={() => scrollToSection('wo-schedule')}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-white/5 bg-zinc-950/40 hover:border-gold/30 hover:bg-gold/5 transition duration-200"
          >
            <Calendar className="h-5 w-5 text-gold-soft" />
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300">Reschedule</span>
          </button>
          
          <button
            type="button"
            onClick={() => setIsCancelModalOpen(true)}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-white/5 bg-zinc-950/40 hover:border-red-500/30 hover:bg-red-950/10 transition duration-200"
          >
            <XCircle className="h-5 w-5 text-red-400" />
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300">Cancel Job</span>
          </button>
          
          <button
            type="button"
            onClick={() => setIsContactOpen(true)}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-white/5 bg-zinc-950/40 hover:border-gold/30 hover:bg-gold/5 transition duration-200"
          >
            <PhoneCall className="h-5 w-5 text-gold-soft" />
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300">Contact</span>
          </button>
          
          <button
            type="button"
            onClick={handleCopyAddress}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-white/5 bg-zinc-950/40 hover:border-gold/30 hover:bg-gold/5 transition duration-200"
          >
            {copiedAddress ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5 text-zinc-400" />}
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300">
              {copiedAddress ? 'Copied!' : 'Copy Address'}
            </span>
          </button>
          
          <a
            href={data.mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-white/5 bg-zinc-950/40 hover:border-gold/30 hover:bg-gold/5 transition duration-200"
          >
            <MapPin className="h-5 w-5 text-gold-soft" />
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300">Directions</span>
          </a>
          
          {data.customerId ? (
            <Link
              href={`/admin/customers/${data.customerId}`}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-white/5 bg-zinc-950/40 hover:border-gold/30 hover:bg-gold/5 transition duration-200"
            >
              <User className="h-5 w-5 text-zinc-400" />
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300">Profile</span>
            </Link>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-white/5 bg-zinc-950/40 opacity-40 cursor-not-allowed">
              <User className="h-5 w-5 text-zinc-600" />
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Profile</span>
            </div>
          )}
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
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className='text-base font-black text-white'>
                      Vehicle {vg.vehicleIndex + 1}: {vg.label}
                    </p>
                    {vg.service ? <p className='text-xs text-zinc-500'>{vg.service.replace(/-/g, ' ')}</p> : null}
                  </div>
                  {vg.before.length > 0 && vg.after.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleOpenBeforeAfterModal(vg)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gold/45 bg-gold/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-gold-soft hover:bg-gold/20 transition duration-200"
                    >
                      Create Before/After Post
                    </button>
                  )}
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
                      existingPhotos={vg.before.concat(vg.after)}
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
        <WorkOrderCollapsible title='Order ledger — payment & receipt' defaultOpen>
          {data.ledgerResolveError ? (
            <p className='rounded-xl border border-red-500/40 bg-red-950/50 px-4 py-3 text-sm text-red-100'>{data.ledgerResolveError}</p>
          ) : null}
          {data.receiptParityDebug ? <ReceiptLedgerDebugPanel parity={data.receiptParityDebug} /> : null}
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

        {data.customerId ? (
          <div id='wo-loyalty' className='scroll-mt-32'>
            <WorkOrderCollapsible 
              title='Loyalty punch controls' 
              badge={String(data.loyaltyStampsCount ?? 0)} 
              defaultOpen={false}
            >
              <div className='grid gap-6 md:grid-cols-2'>
                <div>
                  <p className='text-xs text-zinc-400'>
                    Active loyalty stamps recorded for this customer:
                  </p>
                  <div className='mt-2.5 flex items-center gap-2'>
                    <span className='text-2xl font-black text-white'>
                      {(data.loyaltyStampsCount ?? 0) % 6} / 6
                    </span>
                    <span className='text-xs text-zinc-500 uppercase tracking-widest'>
                      stamps on current card ({(data.loyaltyStampsCount ?? 0)} total)
                    </span>
                  </div>

                  {/* Stamp award form */}
                  <form action={addManualLoyaltyStampAction} className='mt-4 rounded-xl border border-white/10 bg-black/45 p-4 space-y-3'>
                    <input type='hidden' name='customerId' value={data.customerId} />
                    <input type='hidden' name='appointmentId' value={data.id} />
                    
                    <p className='text-[10px] font-black uppercase tracking-wider text-gold-soft'>Award Loyalty Stamps</p>
                    
                    <div className='grid gap-2 grid-cols-2'>
                      <label className='block text-[9px] uppercase font-bold text-zinc-500'>
                        Count
                        <select name='stampCount' className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-xs text-white'>
                          <option value='1'>+1 Stamp</option>
                          <option value='2'>+2 Stamps</option>
                          <option value='3'>+3 Stamps</option>
                          <option value='5'>+5 Stamps</option>
                        </select>
                      </label>
                      <label className='block text-[9px] uppercase font-bold text-zinc-500'>
                        Source
                        <select name='source' className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-xs text-white'>
                          <option value='tech_manual'>Tech Manual</option>
                          <option value='admin_manual'>Admin Manual</option>
                          <option value='membership_bonus'>Membership Bonus</option>
                        </select>
                      </label>
                    </div>
                    
                    <label className='block text-[9px] uppercase font-bold text-zinc-500'>
                      Reason / Note
                      <input name='reason' required placeholder='e.g., Referral bonus, goodwill adjustment...' className='mt-1 w-full rounded border border-zinc-700 bg-black px-2.5 py-1.5 text-xs text-white' />
                    </label>

                    <button type='submit' className='w-full rounded bg-gold py-1.5 text-xs font-black uppercase text-black hover:bg-gold-soft transition'>
                      Award Punch
                    </button>
                  </form>
                </div>

                <div>
                  <p className='text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2'>Punches history</p>
                  {!data.loyaltyStamps || data.loyaltyStamps.length === 0 ? (
                    <p className='text-xs text-zinc-600 italic py-4 border border-dashed border-white/5 rounded-xl text-center'>
                      No stamps recorded.
                    </p>
                  ) : (
                    <ul className='space-y-2.5 max-h-[200px] overflow-y-auto pr-1 text-xs'>
                      {data.loyaltyStamps.map((s) => {
                        const isVoided = Boolean(s.voided);
                        return (
                          <li key={s.id} className={`flex items-start justify-between gap-2 border-b border-white/5 pb-2 last:border-b-0 ${isVoided ? 'opacity-50' : ''}`}>
                            <div className="min-w-0 flex-1">
                              <p className={`font-semibold ${isVoided ? 'line-through text-zinc-500' : 'text-zinc-300'}`}>
                                {s.reason || 'Loyalty stamp earned'}
                              </p>
                              <p className='text-[9px] text-zinc-500 font-mono mt-0.5'>
                                {new Date(s.created_at).toLocaleDateString()}
                                {s.source && ` · ${s.source.replace(/_/g, ' ')}`}
                                {isVoided && ' (Voided)'}
                              </p>
                            </div>
                            <div className='flex items-center gap-1.5 shrink-0'>
                              <span className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-bold ${isVoided ? 'bg-zinc-800 text-zinc-500 line-through' : 'bg-gold/15 text-gold-soft border border-gold/25'}`}>
                                {isVoided ? '0' : `+${s.stamp_count ?? 1}`}
                              </span>
                              {!isVoided && (
                                <form action={deleteLoyaltyStampAction} method='POST' className='flex gap-1'>
                                  <input type='hidden' name='stampId' value={s.id} />
                                  <input type='hidden' name='customerId' value={data.customerId} />
                                  <input type='text' name='voidReason' placeholder='Void reason...' required className='w-16 rounded border border-zinc-700 bg-black px-1 py-0.5 text-[8px] text-white' />
                                  <button type='submit' className='text-[9px] font-black uppercase text-red-400 hover:text-red-300 px-1 border border-red-500/20 rounded bg-red-500/5'>
                                    Void
                                  </button>
                                </form>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </WorkOrderCollapsible>
          </div>
        ) : null}

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

        {!isCompleted && (
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
              jobCompleted={false}
              onOfferMaintenancePlan={() => {
                setIsMaintenanceModalOpen(true);
              }}
            />
          </div>
        )}
      </section>

      {/* Cancellation Modal */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="gb-glass w-full max-w-md rounded-3xl border border-red-500/30 bg-black/95 p-6 space-y-4 text-left shadow-[0_0_50px_rgba(239,68,68,0.15)] animate-in fade-in duration-200">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-red-400 mb-1">Confirm Cancellation</p>
              <h3 className="text-lg font-bold text-white">Cancel Work Order</h3>
            </div>
            
            <form onSubmit={handleCancel} className="space-y-4">
              <input type="hidden" name="id" value={jobId} />
              <input type="hidden" name="source" value={data.source} />
              
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-zinc-400 mb-2">
                  Reason for Cancellation
                </label>
                <textarea
                  name="reason"
                  rows={3}
                  required
                  placeholder="e.g. Customer rescheduled last-minute, weather delay, vehicle unavailable..."
                  className="gb-input w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition"
                />
              </div>

              {cancelError && (
                <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {cancelError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setIsCancelModalOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black uppercase text-zinc-400 hover:text-white transition duration-200"
                >
                  Go Back
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-red-950/40 border border-red-500/40 px-5 py-2.5 text-xs font-black uppercase text-red-200 hover:bg-red-950/60 transition duration-200"
                >
                  {isPending ? 'Cancelling…' : 'Yes, Cancel Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {isContactOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" onClick={() => setIsContactOpen(false)}>
          <div className="gb-glass w-full max-w-sm rounded-3xl border border-gold/30 bg-black/95 p-6 space-y-4 text-left shadow-[0_0_50px_rgba(212,175,55,0.15)] animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft mb-1">Contact Customer</p>
              <h3 className="text-lg font-bold text-white">{data.guestName}</h3>
            </div>
            
            <div className="space-y-2.5 pt-2">
              <a
                href={`tel:${data.guestPhone}`}
                className="flex items-center justify-center gap-3 w-full p-3.5 bg-black/40 border border-white/10 rounded-2xl text-sm font-black uppercase tracking-wider text-white hover:border-gold/30 hover:bg-gold/5 transition duration-200"
              >
                <PhoneCall className="h-4 w-4 text-gold-soft" />
                Call Customer
              </a>
              <a
                href={`sms:${data.guestPhone}`}
                className="flex items-center justify-center gap-3 w-full p-3.5 bg-black/40 border border-white/10 rounded-2xl text-sm font-black uppercase tracking-wider text-white hover:border-gold/30 hover:bg-gold/5 transition duration-200"
              >
                SMS / Text Customer
              </a>
              <a
                href={`mailto:${data.guestEmail}`}
                className="flex items-center justify-center gap-3 w-full p-3.5 bg-black/40 border border-white/10 rounded-2xl text-sm font-black uppercase tracking-wider text-white hover:border-gold/30 hover:bg-gold/5 transition duration-200"
              >
                ✉ Email Customer
              </a>
            </div>

            <button
              type="button"
              onClick={() => setIsContactOpen(false)}
              className="w-full rounded-2xl border border-white/10 p-3 text-center text-xs font-black uppercase text-zinc-400 hover:text-white transition duration-200"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Before/After Post Modal */}
      {beforeAfterVehicle && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" onClick={() => setBeforeAfterVehicle(null)}>
          <div className="gb-glass w-full max-w-2xl rounded-3xl border border-gold/30 bg-black/95 p-6 space-y-4 text-left shadow-[0_0_50px_rgba(212,175,55,0.15)] animate-in fade-in duration-200 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft mb-1">Marketing Integration</p>
              <h3 className="text-lg font-bold text-white">Create Before/After Post</h3>
              <p className="text-xs text-zinc-400 mt-1">Vehicle: {beforeAfterVehicle.label}</p>
            </div>
            
            {postError && (
              <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                {postError}
              </p>
            )}

            {postSuccess && (
              <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                {postSuccess}
              </p>
            )}

            <div className="space-y-4">
              {/* Select Before Image */}
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-zinc-400 mb-2">Select Before Image</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {beforeAfterVehicle.before.map((p: any) => {
                    const isSelected = selectedBeforePhoto === p.url;
                    return (
                      <button
                        key={p.id || p.url}
                        type="button"
                        onClick={() => setSelectedBeforePhoto(p.url)}
                        className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                          isSelected ? 'border-gold shadow-[0_0_12px_rgba(212,175,55,0.4)]' : 'border-white/10 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={p.url} className="h-full w-full object-cover" alt="" />
                        {isSelected && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <span className="text-gold font-bold text-xs">Selected</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Select After Image */}
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-zinc-400 mb-2">Select After Image</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {beforeAfterVehicle.after.map((p: any) => {
                    const isSelected = selectedAfterPhoto === p.url;
                    return (
                      <button
                        key={p.id || p.url}
                        type="button"
                        onClick={() => setSelectedAfterPhoto(p.url)}
                        className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                          isSelected ? 'border-gold shadow-[0_0_12px_rgba(212,175,55,0.4)]' : 'border-white/10 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={p.url} className="h-full w-full object-cover" alt="" />
                        {isSelected && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <span className="text-gold font-bold text-xs">Selected</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title / Caption */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-zinc-400 mb-1">
                  Public Caption / Title
                </label>
                <input
                  type="text"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  className="gb-input w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white placeholder-zinc-500 focus:outline-none focus:border-gold"
                  placeholder="e.g. Tesla Model 3 · Paint Correction"
                />
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/5 bg-zinc-950/40 px-4 py-3 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={useWatermark}
                    onChange={(e) => setUseWatermark(e.target.checked)}
                    className="h-4 w-4 rounded border-white/10 text-gold focus:ring-0"
                  />
                  <span>Add CSS Watermark</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/5 bg-zinc-950/40 px-4 py-3 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={publishImmediately}
                    onChange={(e) => setPublishImmediately(e.target.checked)}
                    className="h-4 w-4 rounded border-white/10 text-gold focus:ring-0"
                  />
                  <span>Publish Immediately</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-white/5">
              <button
                type="button"
                disabled={creatingPost}
                onClick={() => setBeforeAfterVehicle(null)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black uppercase text-zinc-400 hover:text-white transition duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creatingPost || !selectedBeforePhoto || !selectedAfterPhoto || !postTitle.trim()}
                onClick={handleCreateBeforeAfterPost}
                className="rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase text-black hover:bg-gold-soft transition duration-200 shadow-[0_0_15px_rgba(212,175,55,0.3)] disabled:opacity-40"
              >
                {creatingPost ? 'Creating...' : 'Create Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance Offer Modal */}
      {isMaintenanceModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" onClick={() => setIsMaintenanceModalOpen(false)}>
          <div className="gb-glass w-full max-w-2xl rounded-3xl border border-gold/30 bg-black/95 p-6 space-y-4 text-left shadow-[0_0_50px_rgba(212,175,55,0.15)] animate-in fade-in duration-200 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft mb-1">Customer Retention</p>
              <h3 className="text-xl font-bold text-white">Offer Maintenance Plan</h3>
              <p className="text-xs text-zinc-400 mt-1">Select a monthly plan to offer {data.guestName}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {[
                {
                  name: 'Basic Care',
                  price: '$149/mo',
                  slug: 'basic',
                  features: ['Exterior Gloss Wash', 'Express Interior Vacuum', 'Tire & Trim Protection'],
                  pitch: `Gloss Boss ATX: Keep your vehicle looking sharp with our monthly Basic Care plan for just $149/mo. Sign up here: `,
                },
                {
                  name: 'Plus Plan',
                  price: '$249/mo',
                  slug: 'plus',
                  features: ['Premium Interior Cleanse', 'Exterior Wax Restoration', 'Glass & Mirror Clarifier'],
                  pitch: `Gloss Boss ATX: Upgrade your protection with the monthly Plus Plan for $249/mo. Keep interior and exterior flawless. Sign up here: `,
                },
                {
                  name: 'Elite Detail',
                  price: '$399/mo',
                  slug: 'elite',
                  features: ['Monthly Ceramic Booster', 'Leather Conditioning Deep Clean', 'Engine Bay Touchup & Gloss'],
                  pitch: `Gloss Boss ATX: The ultimate concierge treatment. Monthly Elite Detail for $399/mo including ceramic maintenance. Sign up here: `,
                },
              ].map((plan) => {
                const bookLink = typeof window !== 'undefined'
                  ? `${window.location.origin}/book?ref=maintenance&plan=${plan.slug}&customer=${data.customerId || ''}`
                  : `/book?plan=${plan.slug}`;
                const fullPitch = `${plan.pitch}${bookLink}`;

                return (
                  <div key={plan.slug} className="gb-glass bg-zinc-950/40 rounded-2xl p-4 border border-white/5 space-y-3 flex flex-col justify-between">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-gold-soft bg-gold/10 border border-gold/30 px-2 py-0.5 rounded-full">
                        {plan.name}
                      </span>
                      <p className="text-xl font-black text-white mt-2 font-mono">{plan.price}</p>
                      <ul className="text-[10px] text-zinc-400 mt-3 space-y-1.5 list-disc pl-3">
                        {plan.features.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                    
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(bookLink);
                          alert('Booking link copied!');
                        }}
                        className="w-full text-center py-2 bg-zinc-900 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:text-white hover:border-gold/30 transition duration-200"
                      >
                        Copy Link
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(fullPitch);
                          alert('Pitch copied to clipboard!');
                        }}
                        className="w-full text-center py-2 bg-zinc-900 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:text-white hover:border-gold/30 transition duration-200"
                      >
                        Copy Pitch
                      </button>
                      
                      {!data.isFallback ? (
                        <button
                          type="button"
                          onClick={() => {
                            setMaintenancePitchText(fullPitch);
                            setIsMaintenanceModalOpen(false);
                            setIsMaintenanceConfirmOpen(true);
                            setMaintenanceError(null);
                            setMaintenanceSuccess(null);
                          }}
                          className="w-full text-center py-2 bg-gold text-black rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-gold-soft transition duration-200"
                        >
                          Send SMS Offer
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => setIsMaintenanceModalOpen(false)}
                className="rounded-xl border border-white/10 px-5 py-2.5 text-xs font-black uppercase text-zinc-400 hover:text-white transition duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance Offer Confirmation Modal */}
      {isMaintenanceConfirmOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="gb-glass w-full max-w-md rounded-3xl border border-gold/30 bg-black/95 p-6 space-y-4 text-left shadow-[0_0_50px_rgba(212,175,55,0.15)] animate-in fade-in duration-200">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft mb-1">Send SMS Pitch</p>
              <h3 className="text-lg font-bold text-white">Confirm Maintenance Offer</h3>
            </div>
            
            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4 font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {maintenancePitchText}
            </div>

            <p className="text-[10px] text-zinc-500">
              This will send the customized maintenance booking link to {data.guestName} via SMS text.
            </p>

            {maintenanceError && (
              <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                {maintenanceError}
              </p>
            )}
            
            {maintenanceSuccess && (
              <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                {maintenanceSuccess}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={sendingMaintenance}
                onClick={() => setIsMaintenanceConfirmOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black uppercase text-zinc-400 hover:text-white transition duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sendingMaintenance}
                onClick={handleSendMaintenanceSms}
                className="rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase text-black hover:bg-gold-soft transition duration-200 shadow-[0_0_15px_rgba(212,175,55,0.3)]"
              >
                {sendingMaintenance ? 'Sending...' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, CreditCard, FileSignature, Calendar, XCircle, PhoneCall, Copy, Check, MapPin, User, CheckCircle2, MessageSquare, FileText } from 'lucide-react';
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
import type { CreditHistoryItem, CreditRedemptionItem } from '@/components/admin/customer-credits-manager';
import type { WeatherSnapshot } from '@/lib/weather-forecast';
import { JobWeatherIndicator } from '@/components/weather/job-weather-indicator';

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
  appleMapsHref?: string;
  googleDirectionsHref?: string;
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
  weather?: WeatherSnapshot;
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
  unassignedPaymentDiagnostics?: Array<{
    id: string;
    amount: string;
    amountCents?: number;
    status: string;
    method: string;
    source: string;
    appointmentId: string;
    fallbackBookingId: string;
    customerId: string;
    stripeSession: string;
    stripeIntent: string;
    at: string;
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
  credits?: CreditHistoryItem[];
  redemptions?: CreditRedemptionItem[];
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

  const [activeTab, setActiveTab] = useState<'overview' | 'photos' | 'payments' | 'customer' | 'vehicle' | 'notes' | 'documents'>('overview');
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

  const getTimelineSteps = () => {
    const isArrived = data.job.status !== 'confirmed' && data.job.status !== 'pending';
    const isPreInspected = data.preInspection?.damageAck.damageAckComplete || (data.agreementSigned && data.job.status !== 'confirmed' && data.job.status !== 'pending' && data.job.status !== 'arrived');
    const isDetailing = data.job.status === 'in_progress' || Boolean(data.openTimerId) || isCompleted;
    const isPhotosUploaded = data.beforePhotos.length > 0 || data.afterPhotos.length > 0 || data.photosByVehicle.some(v => v.before.length > 0 || v.after.length > 0);
    const isPaid = data.paymentComplete;
    const isClosed = isCompleted && data.paymentComplete;

    return [
      { label: 'Arrival', ok: isArrived },
      { label: 'Pre-Inspect', ok: isPreInspected },
      { label: 'Detailing', ok: isDetailing },
      { label: 'Photos Uploaded', ok: isPhotosUploaded },
      { label: 'Payment', ok: isPaid },
      { label: 'Closeout', ok: isClosed },
    ];
  };

  return (
    <div className='gb-page-pad gb-wo-mission-pad space-y-5 pb-32 md:space-y-6'>
      <WorkOrderMissionBar
        activeTab={activeTab}
        onTabChange={(tab: any) => setActiveTab(tab)}
        timerRunning={Boolean(data.openTimerId)}
        hasPreInspection={Boolean(data.preInspection)}
      />

      {/* 1. CLEAN HORIZONTAL HEADER */}
      <div className="rounded-3xl border border-gold/15 bg-black/45 p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 h-32 w-32 bg-gold/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500">Work Order</span>
              <PremiumBadge tone='gold'>#{data.canonicalId.slice(0, 8).toUpperCase()}</PremiumBadge>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight mt-1">{data.guestName}</h1>
            <p className="text-sm font-semibold text-gold-soft mt-1">{vehicleLine}</p>
          </div>
          
          <div className="grid grid-cols-2 md:flex md:items-center gap-6 text-xs border-t border-white/5 md:border-t-0 pt-4 md:pt-0">
            <div>
              <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Status</p>
              <span className={`inline-block mt-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                data.paymentComplete ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20' : 'bg-gold/10 text-gold-soft border border-gold/20'
              }`}>
                {data.statusLabel}
              </span>
            </div>
            <div>
              <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Appointment Time</p>
              <p className="font-semibold text-zinc-300 mt-1">{data.scheduledStart || 'TBD'}</p>
              {data.weather ? <JobWeatherIndicator weather={data.weather} /> : null}
            </div>
            <div>
              <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Outstanding Balance</p>
              <p className={`font-mono font-black text-sm mt-1 ${data.balanceDueCents > 0 ? 'text-rose-400' : 'text-emerald-300'}`}>
                {data.balanceDue}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CONDITIONAL TAB CONTENTS */}

      {/* === OVERVIEW TAB === */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-200">
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

          {/* Visual Job Timeline */}
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
                    data.jobCompletedAt || data.statusLabel.toLowerCase().includes('complete') ? '80%' :
                    data.job.status === 'in_progress' || data.openTimerId ? '50%' :
                    data.preInspection?.damageAck.damageAckComplete ? '30%' : '10%'
                  }`
                }}
              />
              
              {/* Stepper Nodes */}
              {getTimelineSteps().map((step, idx) => {
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
            <SectionEyebrow>Quick Actions</SectionEyebrow>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('overview');
                  setTimeout(() => {
                    const el = document.getElementById('wo-schedule-panel');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
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
                href={data.googleDirectionsHref || data.mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-white/5 bg-zinc-950/40 hover:border-gold/30 hover:bg-gold/5 transition duration-200"
              >
                <MapPin className="h-5 w-5 text-gold-soft" />
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300">Google</span>
              </a>
              {data.appleMapsHref ? (
                <a
                  href={data.appleMapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-white/5 bg-zinc-950/40 hover:border-gold/30 hover:bg-gold/5 transition duration-200"
                >
                  <MapPin className="h-5 w-5 text-zinc-300" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300">Apple</span>
                </a>
              ) : null}
              
              {data.customerId ? (
                <button
                  onClick={() => setActiveTab('customer')}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-white/5 bg-zinc-950/40 hover:border-gold/30 hover:bg-gold/5 transition duration-200"
                >
                  <User className="h-5 w-5 text-zinc-400" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300">Profile</span>
                </button>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-white/5 bg-zinc-950/40 opacity-40 cursor-not-allowed">
                  <User className="h-5 w-5 text-zinc-600" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Profile</span>
                </div>
              )}
            </div>
          </div>

          {/* Summary Financial Cards */}
          <div className='gb-mission-metrics grid grid-cols-2 md:grid-cols-4 gap-4'>
            <div className='gb-premium-card rounded-2xl border border-gold/30 px-4 py-3.5 bg-zinc-950/50 shadow-[0_0_15px_rgba(212,175,55,0.08)] backdrop-blur-sm'>
              <p className='text-[9px] font-black uppercase tracking-wider text-zinc-400'>Final total</p>
              <p className='mt-1 font-mono text-lg font-black text-gold-soft'>{data.finalTotal ?? data.baseSubtotal}</p>
            </div>
            <div className='gb-premium-card rounded-2xl border border-white/10 px-4 py-3.5 bg-zinc-950/50 shadow-md backdrop-blur-sm hover:border-gold/15 transition duration-300'>
              <p className='text-[9px] font-black uppercase tracking-wider text-zinc-400'>Balance</p>
              <p className='mt-1 font-mono text-lg font-black text-white'>{data.balanceDue}</p>
            </div>
            <div className='gb-premium-card rounded-2xl border border-white/10 px-4 py-3.5 bg-zinc-950/50 shadow-md backdrop-blur-sm hover:border-gold/15 transition duration-300'>
              <p className='text-[9px] font-black uppercase tracking-wider text-zinc-400'>Paid</p>
              <p className='mt-1 font-mono text-lg font-black text-emerald-300'>{data.totalPaid ?? '—'}</p>
            </div>
            <div className='gb-premium-card rounded-2xl border border-white/10 px-4 py-3.5 bg-zinc-950/50 shadow-md backdrop-blur-sm hover:border-gold/15 transition duration-300'>
              <p className='text-[9px] font-black uppercase tracking-wider text-zinc-400'>Requirements</p>
              <p className='mt-1 font-mono text-lg font-black text-white'>{progressPct}%</p>
            </div>
          </div>

          {/* Timer section */}
          <div id='wo-timer' className='scroll-mt-28 rounded-2xl border border-gold/25 bg-black/50 p-6'>
            <div id='timer-section-toggle' className='flex items-center justify-between border-b border-white/5 pb-2 mb-3'>
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

          {/* Schedule settings */}
          <div id='wo-schedule-panel' className='space-y-4'>
            {canEditPricing && !data.isFallback && data.scheduledStartIso ? (
              <WorkOrderSchedulePanel appointmentId={jobId} scheduledStart={data.scheduledStartIso} scheduledEnd={data.scheduledEnd} />
            ) : null}
            {canAdminOverride && !data.isFallback && data.source === 'appointment' ? (
              <AppointmentScheduleControls appointmentId={jobId} scheduledStart={data.scheduledStartIso} />
            ) : null}
          </div>

          {/* Checklist / Requirements snapshot */}
          <div className='bg-zinc-950/45 p-6 rounded-3xl border border-white/5'>
            <SectionEyebrow>Intake Progress Tracker</SectionEyebrow>
            <div className='mt-4'>
              <ProgressTracker steps={data.requirements} />
            </div>
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
        </div>
      )}

      {/* === PHOTOS TAB === */}
      {activeTab === 'photos' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {data.preInspection ? (
            <div id='wo-preinspect' className='scroll-mt-28'>
              <div className='gb-premium-card rounded-3xl border border-gold/15 bg-black/45 p-6 shadow-xl relative overflow-hidden'>
                <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                  <SectionEyebrow>Pre-inspection & checklist</SectionEyebrow>
                  <PremiumBadge tone="gold">{data.preInspection.photoProgress}</PremiumBadge>
                </div>
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
              </div>
            </div>
          ) : null}

          <div id='wo-photos' className='scroll-mt-28'>
            <div className="gb-premium-card rounded-3xl border border-gold/15 bg-black/45 p-6 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                <SectionEyebrow>Photos & gallery</SectionEyebrow>
                <PremiumBadge tone="zinc">{data.vehicles.length} vehicle{data.vehicles.length === 1 ? '' : 's'}</PremiumBadge>
              </div>

              {data.photoUploadDisabled ? (
                <p className='mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100'>
                  {data.photoUploadDisableReason ?? 'Photo upload disabled for archived/test/orphan job.'}
                </p>
              ) : null}

              {(data.photosByVehicle?.length ? data.photosByVehicle : []).map((vg) => (
                <div key={vg.vehicleIndex} className='gb-premium-card mb-6 rounded-2xl border border-white/10 bg-zinc-950/20 p-5 space-y-4'>
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
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gold/45 bg-gold/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-gold-soft hover:bg-gold/25 transition duration-200"
                      >
                        Create Before/After Post
                      </button>
                    )}
                  </div>
                  
                  {/* Comparative Photos Timeline */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="gb-glass bg-zinc-950/45 rounded-xl p-3 border border-white/5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-200 mb-2">Before Restoration</p>
                      <WorkOrderGallery title="" photos={vg.before} canDelete={data.canDeletePhotos} />
                    </div>
                    <div className="gb-glass bg-zinc-950/45 rounded-xl p-3 border border-white/5">
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
            </div>
          </div>
        </div>
      )}

      {/* === PAYMENTS TAB === */}
      {activeTab === 'payments' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {isCompleted && (
            <div className='scroll-mt-36'>
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

          <div id='wo-payment' className='scroll-mt-28'>
            <div id="wo-payment-card" className="gb-premium-card rounded-3xl border border-gold/15 bg-black/45 p-6 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                <SectionEyebrow>Order Ledger — payment & receipt</SectionEyebrow>
                <PremiumBadge tone={data.paymentComplete ? 'emerald' : 'amber'}>
                  {data.paymentComplete ? 'Paid' : 'Unpaid'}
                </PremiumBadge>
              </div>

              {data.ledgerResolveError ? (
                <p className='rounded-xl border border-red-500/40 bg-red-950/50 px-4 py-3 text-sm text-red-100'>{data.ledgerResolveError}</p>
              ) : null}
              {data.canAdvancedRepair && data.receiptParityDebug ? <ReceiptLedgerDebugPanel parity={data.receiptParityDebug} /> : null}
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
                  unassignedPaymentDiagnostics={data.unassignedPaymentDiagnostics ?? []}
                  customerId={data.customerId}
                  credits={data.credits}
                  redemptions={data.redemptions}
                />
              ) : !data.ledgerResolveError ? (
                <p className='rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100'>
                  Order ledger unavailable — refresh the page.
                </p>
              ) : null}
              
              {!data.isFallback ? (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <WorkOrderMileagePanel
                    appointmentId={jobId}
                    workOrderPath={data.workOrderPath ?? `/tech/work-orders/${jobId}`}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* Loyalty Punch Card Controls */}
          {data.customerId ? (
            <div id='wo-loyalty' className='scroll-mt-32'>
              <div className="gb-premium-card rounded-3xl border border-gold/15 bg-black/45 p-6 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                  <SectionEyebrow>Loyalty punch controls</SectionEyebrow>
                  <PremiumBadge tone="gold">{data.loyaltyStampsCount ?? 0} Punches</PremiumBadge>
                </div>

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
                          <select name='stampCount' className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-xs text-white focus:outline-none focus:border-gold'>
                            <option value='1'>+1 Stamp</option>
                            <option value='2'>+2 Stamps</option>
                            <option value='3'>+3 Stamps</option>
                            <option value='5'>+5 Stamps</option>
                          </select>
                        </label>
                        <label className='block text-[9px] uppercase font-bold text-zinc-500'>
                          Source
                          <select name='source' className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-xs text-white focus:outline-none focus:border-gold'>
                            <option value='tech_manual'>Tech Manual</option>
                            <option value='admin_manual'>Admin Manual</option>
                            <option value='membership_bonus'>Membership Bonus</option>
                          </select>
                        </label>
                      </div>
                      
                      <label className='block text-[9px] uppercase font-bold text-zinc-500'>
                        Reason / Note
                        <input name='reason' required placeholder='e.g., Referral bonus, goodwill adjustment...' className='mt-1 w-full rounded border border-zinc-700 bg-black px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-gold' />
                      </label>

                      <button type='submit' className='w-full rounded bg-gold py-1.5 text-xs font-black uppercase text-black hover:bg-gold-soft transition'>
                        Award Punch
                      </button>
                    </form>
                  </div>

                  <div>
                    <p className='text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2'>Punches history</p>
                    {!data.loyaltyStamps || data.loyaltyStamps.length === 0 ? (
                      <p className='text-xs text-zinc-600 italic py-4 border border-dashed border-white/5 rounded-xl text-center bg-black/20'>
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
                                    <input type='text' name='voidReason' placeholder='Void reason...' required className='w-16 rounded border border-zinc-700 bg-black px-1 py-0.5 text-[8px] text-white focus:outline-none' />
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
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* === CUSTOMER TAB === */}
      {activeTab === 'customer' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="gb-premium-card rounded-3xl border border-gold/15 bg-black/45 p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <SectionEyebrow>Customer CRM Profile</SectionEyebrow>
              <PremiumBadge tone="zinc">Details & Contact</PremiumBadge>
            </div>

            <div className='grid gap-4 md:grid-cols-2 text-sm text-zinc-300'>
              <div className="space-y-2">
                <p className="font-bold text-white uppercase text-[10px] tracking-wider text-zinc-500">Contact Details</p>
                <div className="p-4 bg-zinc-950/40 rounded-2xl border border-white/5 space-y-2">
                  <p><span className="text-zinc-500">Name:</span> <strong className="text-white">{data.guestName}</strong></p>
                  <p><span className="text-zinc-500">Phone:</span> <strong className="text-white">{data.guestPhone || 'None'}</strong></p>
                  <p><span className="text-zinc-500">Email:</span> <strong className="text-white">{data.guestEmail || 'None'}</strong></p>
                </div>

                <p className="font-bold text-white uppercase text-[10px] tracking-wider text-zinc-500">Quick Connect Links</p>
                <div className="grid grid-cols-3 gap-2">
                  <a
                    href={`tel:${data.guestPhone}`}
                    className="flex flex-col items-center justify-center p-3.5 bg-black/45 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:border-gold/30 hover:bg-gold/5 transition duration-200"
                  >
                    <PhoneCall className="h-4 w-4 text-gold-soft mb-1" />
                    Call
                  </a>
                  <a
                    href={`sms:${data.guestPhone}`}
                    className="flex flex-col items-center justify-center p-3.5 bg-black/45 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:border-gold/30 hover:bg-gold/5 transition duration-200"
                  >
                    <MessageSquare className="h-4 w-4 text-gold-soft mb-1" />
                    SMS
                  </a>
                  <a
                    href={`mailto:${data.guestEmail}`}
                    className="flex flex-col items-center justify-center p-3.5 bg-black/45 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:border-gold/30 hover:bg-gold/5 transition duration-200"
                  >
                    ✉ Email
                  </a>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-bold text-white uppercase text-[10px] tracking-wider text-zinc-500">Service Location</p>
                <div className="p-4 bg-zinc-950/40 rounded-2xl border border-white/5 space-y-2">
                  <p className="text-white font-medium">{data.fullAddress || 'No address provided'}</p>
                  
                  {data.mapsHref || data.googleDirectionsHref || data.appleMapsHref ? (
                    <div className="mt-1 flex flex-wrap gap-3">
                      {(data.googleDirectionsHref || data.mapsHref) ? (
                        <a
                          href={data.googleDirectionsHref || data.mapsHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-gold-soft hover:underline font-bold"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          Google Maps
                        </a>
                      ) : null}
                      {data.appleMapsHref ? (
                        <a
                          href={data.appleMapsHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:underline font-bold"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          Apple Maps
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                
                {(data.accessLocation || data.accessWater || data.accessPower || data.accessParking || data.gateNotes) && (
                  <div className="p-4 bg-zinc-950/40 rounded-2xl border border-white/5 space-y-1 text-xs">
                    <p className="font-bold text-[9px] uppercase tracking-wider text-zinc-500 mb-1">Access Notes</p>
                    {data.accessLocation && <p><span className="text-zinc-500">Location:</span> {data.accessLocation}</p>}
                    {data.accessWater && <p><span className="text-zinc-500">Water Source:</span> {data.accessWater}</p>}
                    {data.accessPower && <p><span className="text-zinc-500">Power Source:</span> {data.accessPower}</p>}
                    {data.accessParking && <p><span className="text-zinc-500">Parking Setup:</span> {data.accessParking}</p>}
                    {data.gateNotes && <p><span className="text-zinc-500">Gate/Code Notes:</span> {data.gateNotes}</p>}
                  </div>
                )}
              </div>
            </div>

            {/* Profile edit form */}
            <div className="mt-6 pt-6 border-t border-white/10">
              <p className="font-bold text-white uppercase text-[10px] tracking-wider text-zinc-500 mb-3">Edit Customer & Location Details</p>
              <form action={updateDetailsAction} className='grid gap-3 sm:grid-cols-2'>
                <input type='hidden' name='id' value={jobId} />
                <input type='hidden' name='source' value={data.source} />
                
                <label className="block text-[9px] uppercase font-bold text-zinc-500">
                  Guest Name
                  <input name='guestName' defaultValue={data.guestName} placeholder='Guest Name' className='gb-input mt-1 focus:border-gold' />
                </label>
                
                <label className="block text-[9px] uppercase font-bold text-zinc-500">
                  Phone Number
                  <input name='guestPhone' defaultValue={data.guestPhone} placeholder='Phone Number' className='gb-input mt-1 focus:border-gold' />
                </label>

                <label className="block text-[9px] uppercase font-bold text-zinc-500 sm:col-span-2">
                  Email Address
                  <input name='guestEmail' defaultValue={data.guestEmail} placeholder='Email Address' className='gb-input mt-1 focus:border-gold' />
                </label>

                <label className="block text-[9px] uppercase font-bold text-zinc-500 sm:col-span-2">
                  Street Address
                  <input name='serviceAddress' defaultValue={data.serviceAddress} placeholder='Street Address' className='gb-input mt-1 focus:border-gold' />
                </label>

                <label className="block text-[9px] uppercase font-bold text-zinc-500">
                  City
                  <input name='serviceCity' defaultValue={data.serviceCity} placeholder='City' className='gb-input mt-1 focus:border-gold' />
                </label>

                <label className="block text-[9px] uppercase font-bold text-zinc-500">
                  State
                  <input name='serviceState' defaultValue={data.serviceState} placeholder='State' className='gb-input mt-1 focus:border-gold' />
                </label>

                <label className="block text-[9px] uppercase font-bold text-zinc-500 sm:col-span-2">
                  ZIP Code
                  <input name='serviceZip' defaultValue={data.serviceZip} placeholder='ZIP Code' className='gb-input mt-1 focus:border-gold' />
                </label>

                <button type='submit' className='sm:col-span-2 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-xs font-black uppercase text-gold-soft hover:bg-gold/20 transition duration-200 mt-2'>
                  Save Customer Details
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* === VEHICLE TAB === */}
      {activeTab === 'vehicle' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="gb-premium-card rounded-3xl border border-gold/15 bg-black/45 p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <SectionEyebrow>Vehicles Configuration</SectionEyebrow>
              <PremiumBadge tone="zinc">{data.vehicles.length} Vehicle{data.vehicles.length === 1 ? '' : 's'}</PremiumBadge>
            </div>

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
        </div>
      )}

      {/* === NOTES TAB === */}
      {activeTab === 'notes' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="gb-premium-card rounded-3xl border border-gold/15 bg-black/45 p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <SectionEyebrow>Chronological Notes</SectionEyebrow>
              <PremiumBadge tone="zinc">{data.notes.length} Note{data.notes.length === 1 ? '' : 's'}</PremiumBadge>
            </div>

            {data.notes.length === 0 ? (
              <p className='text-sm text-zinc-500 py-6 text-center bg-black/20 border border-dashed border-white/5 rounded-2xl'>No operational notes recorded yet.</p>
            ) : (
              <ul className='space-y-3'>
                {data.notes.map((n) => (
                  <li key={n.id} className='rounded-xl border border-white/10 bg-zinc-950/30 px-4 py-3 text-sm'>
                    <p className='text-[10px] font-bold uppercase text-gold-soft'>{n.vehicleLabel} · {n.time}</p>
                    <p className='mt-1 whitespace-pre-wrap text-zinc-300 leading-relaxed'>{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Timeline & notifications outbox */}
          <div id='wo-timeline'>
            <div className="gb-premium-card rounded-3xl border border-gold/15 bg-black/45 p-6 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                <SectionEyebrow>Timeline & Notifications</SectionEyebrow>
                <PremiumBadge tone="zinc">{data.timeline.length} Events</PremiumBadge>
              </div>

              <TimelineRail events={data.timeline} />

              {data.outbox.length > 0 ? (
                <div className="mt-6 pt-4 border-t border-white/5 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">SMS & Email Outbox History</p>
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
            </div>
          </div>
        </div>
      )}

      {/* === DOCUMENTS TAB === */}
      {activeTab === 'documents' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <section id='wo-agreement' className='scroll-mt-28'>
            <div className="gb-premium-card rounded-3xl border border-gold/15 bg-black/45 p-6 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                <SectionEyebrow>Agreement & Acknowledgement</SectionEyebrow>
                <PremiumBadge tone={data.agreementSigned ? 'emerald' : 'amber'}>
                  {data.agreementSigned ? 'Signed' : 'Required'}
                </PremiumBadge>
              </div>

              <p className='text-sm text-zinc-300 leading-relaxed'>
                {data.agreementSigned
                  ? 'Legal liability agreement is signed and on file for this job.'
                  : 'Capture liability and service intake acknowledgement before starting field work — this is step 1 in job progress.'}
              </p>
              <div className='mt-5 flex flex-wrap gap-2'>
                <Link
                  href={data.agreementCaptureHref}
                  className='gb-premium-btn rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs font-black uppercase text-gold-soft hover:bg-gold/20 transition'
                >
                  {data.agreementSigned ? 'Recapture agreement' : 'Capture agreement'}
                </Link>
                <Link
                  href={data.agreementDetailHref}
                  className='gb-premium-btn rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black uppercase text-zinc-200 hover:bg-white/5 transition'
                >
                  View agreement
                </Link>
              </div>
            </div>
          </section>
        </div>
      )}

      {canAdminOverride && data.uploadContextDebug ? (
        <div className='rounded-xl border border-dashed border-gold/30 bg-zinc-950/80 px-4 py-3 font-mono text-[10px] text-zinc-400'>
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

      {/* 3. STICKY MOBILE ACTION BAR */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-t border-white/10 px-3 py-2 flex justify-around items-center shadow-2xl">
        {/* Message Customer */}
        <button
          onClick={() => setIsContactOpen(true)}
          className="flex flex-col items-center justify-center p-2 text-zinc-400 hover:text-gold-soft transition"
        >
          <MessageSquare className="h-5 w-5" />
          <span className="text-[9px] font-bold uppercase mt-1">Message</span>
        </button>

        {/* Start Job / Timer */}
        <button
          onClick={() => {
            setActiveTab('overview');
            setTimeout(() => {
              const el = document.getElementById('timer-section-toggle');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }}
          className={`flex flex-col items-center justify-center p-2 transition ${
            data.openTimerId ? 'text-emerald-400 font-bold animate-pulse' : 'text-zinc-400 hover:text-gold-soft'
          }`}
        >
          <Clock className="h-5 w-5" />
          <span className="text-[9px] font-bold uppercase mt-1">{data.openTimerId ? 'Timer On' : 'Start Job'}</span>
        </button>

        {/* Complete Job */}
        <button
          onClick={() => {
            if (isCompleted) {
              setActiveTab('payments');
            } else {
              setActiveTab('overview');
              setTimeout(() => {
                const el = document.getElementById('wo-complete-top') || document.getElementById('wo-complete');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            }
          }}
          className={`flex flex-col items-center justify-center p-2 transition ${
            isCompleted ? 'text-zinc-500' : 'text-zinc-400 hover:text-gold-soft'
          }`}
        >
          <CheckCircle2 className="h-5 w-5" />
          <span className="text-[9px] font-bold uppercase mt-1">Complete</span>
        </button>

        {/* Collect Payment */}
        <button
          onClick={() => {
            setActiveTab('payments');
            setTimeout(() => {
              const el = document.getElementById('wo-payment-card');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }}
          className={`flex flex-col items-center justify-center p-2 transition ${
            data.paymentComplete ? 'text-emerald-400 font-bold' : 'text-zinc-400 hover:text-gold-soft'
          }`}
        >
          <CreditCard className="h-5 w-5" />
          <span className="text-[9px] font-bold uppercase mt-1">Payment</span>
        </button>

        {/* Send Receipt */}
        {data.receiptPdfHref ? (
          <a
            href={data.receiptPdfHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center p-2 text-zinc-400 hover:text-gold-soft transition"
          >
            <FileText className="h-5 w-5" />
            <span className="text-[9px] font-bold uppercase mt-1">Receipt</span>
          </a>
        ) : (
          <button
            onClick={() => {
              setActiveTab('payments');
              alert('Please complete the job and process payment first to generate a receipt.');
            }}
            className="flex flex-col items-center justify-center p-2 text-zinc-600 cursor-not-allowed"
          >
            <FileText className="h-5 w-5" />
            <span className="text-[9px] font-bold uppercase mt-1">Receipt</span>
          </button>
        )}
      </div>

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
                <MessageSquare className="h-4 w-4 text-gold-soft" />
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
                  name: 'Bronze',
                  price: '$24/mo',
                  slug: 'bronze',
                  features: ['10% off services', 'Digital punch card', 'Priority scheduling access'],
                  pitch: `Gloss Boss ATX: Your Bronze membership keeps every detail easier with 10% off, priority scheduling, and loyalty rewards. Join here: `,
                },
                {
                  name: 'Silver',
                  price: '$49/mo',
                  slug: 'silver',
                  features: ['15% off services', 'Quarterly upgrade credit', 'Silver loyalty rewards'],
                  pitch: `Gloss Boss ATX: Silver membership adds 15% off, priority scheduling, quarterly upgrade credit, and loyalty rewards. Join here: `,
                },
                {
                  name: 'Gold',
                  price: '$79/mo',
                  slug: 'gold',
                  features: ['20% off services', 'Front-of-line scheduling', 'VIP upgrade and annual credits'],
                  pitch: `Gloss Boss ATX: Gold membership is the VIP lane with 20% off, front-of-line scheduling, upgrade credits, and punch-card rewards. Join here: `,
                },
              ].map((plan) => {
                const bookLink = typeof window !== 'undefined'
                  ? `${window.location.origin}/memberships?plan=${plan.slug}&customer=${data.customerId || ''}`
                  : `/memberships?plan=${plan.slug}`;
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

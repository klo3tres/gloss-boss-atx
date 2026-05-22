'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Bell,
  Car,
  CheckCircle2,
  Clock,
  CreditCard,
  FileSignature,
  MapPin,
  Phone,
  User,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CollapsibleSection,
  GlassCard,
  PremiumBadge,
  ProgressTracker,
  SectionEyebrow,
  StickyActionBar,
  TimelineRail,
} from '@/components/ui/premium';
import { NotificationSendForm } from '@/components/tech/notification-send-form';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import { TechJobWorkspace } from '@/app/(dashboard)/tech/tech-job-workspace';
import { TechTimerControls } from '@/app/(dashboard)/tech/tech-timer-controls';
import { WorkOrderPhotoUpload } from '@/app/(dashboard)/tech/work-order-photo-upload';
import { WorkOrderGallery, type WorkOrderGalleryPhoto } from '@/app/(dashboard)/tech/work-order-gallery';
import { WorkOrderVehiclesForm } from '@/components/tech/work-order-vehicles-form';
import { techSendActiveJobNotificationAction } from '@/app/(dashboard)/tech/tech-actions';

export type WorkOrderConsoleData = {
  id: string;
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

const NOTIFY_KINDS = [
  { id: 'job_started', label: 'Job started' },
  { id: 'last_touches', label: 'Last touches' },
  { id: 'payment_link', label: 'Pay now' },
  { id: 'review_request', label: 'Review request' },
  { id: 'job_completed', label: 'Job complete' },
] as const;

export function WorkOrderConsoleClient({
  data,
  updateDetailsAction,
  updateVehiclesAction,
  saveVehicleNotesAction,
  recordCashAction,
  completeJobAction,
}: {
  data: WorkOrderConsoleData;
  updateDetailsAction: (formData: FormData) => void | Promise<void>;
  updateVehiclesAction: (formData: FormData) => void | Promise<void>;
  saveVehicleNotesAction: (formData: FormData) => void | Promise<void>;
  recordCashAction: (formData: FormData) => void | Promise<void>;
  completeJobAction: (formData: FormData) => void | Promise<void>;
}) {
  const [notifyKind, setNotifyKind] = useState<string>(NOTIFY_KINDS[0].id);
  const progressPct = useMemo(() => {
    const ok = data.requirements.filter((r) => r.ok).length;
    return data.requirements.length ? Math.round((ok / data.requirements.length) * 100) : 0;
  }, [data.requirements]);

  return (
    <div className='gb-page-pad space-y-8 pb-28'>
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className='gb-glass overflow-hidden rounded-3xl border border-gold/25 shadow-[0_0_50px_rgba(212,175,55,0.14)]'
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

      <div className='grid gap-6 lg:grid-cols-12'>
        <div className='space-y-6 lg:col-span-8'>
          <GlassCard glow>
            <SectionEyebrow>Activity timeline</SectionEyebrow>
            <div className='mt-4 max-h-64 overflow-y-auto pr-2'>
              <TimelineRail events={data.timeline} />
            </div>
          </GlassCard>

          <div className='grid gap-4 sm:grid-cols-2'>
            <GlassCard>
              <div className='flex items-start gap-3'>
                <User className='h-5 w-5 text-gold-soft' />
                <div>
                  <SectionEyebrow>Customer</SectionEyebrow>
                  <p className='mt-2 text-xl font-bold text-white'>{data.guestName}</p>
                  <p className='text-sm text-zinc-400'>{data.guestPhone || 'No phone'}</p>
                  <p className='text-sm text-zinc-500'>{data.guestEmail || 'No email'}</p>
                </div>
              </div>
            </GlassCard>
            <GlassCard>
              <div className='flex items-start gap-3'>
                <Car className='h-5 w-5 text-gold-soft' />
                <div>
                  <SectionEyebrow>Service</SectionEyebrow>
                  <p className='mt-2 text-xl font-bold text-white'>{data.serviceLabel}</p>
                  <p className='text-sm text-zinc-400'>{data.vehicles.length} vehicle{data.vehicles.length === 1 ? '' : 's'}</p>
                  <p className='text-sm text-zinc-500'>{data.baseTotal} · {data.balanceDue} due</p>
                </div>
              </div>
            </GlassCard>
          </div>

          <CollapsibleSection title='Photos' subtitle='Before & after galleries' badge={<PremiumBadge>{data.beforePhotos.length + data.afterPhotos.length} shots</PremiumBadge>}>
            <div className='grid gap-6 lg:grid-cols-2'>
              <WorkOrderGallery title='Before' photos={data.beforePhotos} />
              <WorkOrderGallery title='After' photos={data.afterPhotos} />
            </div>
          </CollapsibleSection>

          <CollapsibleSection title='Vehicles & field work' subtitle='Per-vehicle upload, timer, notes' defaultOpen>
            <div className='space-y-6'>
              {data.vehicles.map((v, i) => (
                <article key={i} className='rounded-2xl border border-white/10 bg-black/40 p-5'>
                  <p className='font-bold text-white'>{v.label}</p>
                  <p className='text-sm text-zinc-500'>{v.partsLine}</p>
                  <div className='mt-4'>
                    <WorkOrderPhotoUpload
                      appointmentId={data.isFallback ? null : data.id}
                      fallbackBookingId={data.isFallback ? data.id : null}
                      workflowSessionId={data.workflowSessionId}
                      vehicleIndex={i}
                      vehicleLabel={v.label}
                    />
                  </div>
                  <form action={saveVehicleNotesAction} className='mt-4'>
                    {!data.isFallback ? <input type='hidden' name='appointmentId' value={data.id} /> : null}
                    {data.isFallback ? <input type='hidden' name='fallbackBookingId' value={data.id} /> : null}
                    {data.workflowSessionId ? <input type='hidden' name='workflowSessionId' value={data.workflowSessionId} /> : null}
                    <input type='hidden' name='vehicleIndex' value={String(i)} />
                    <textarea name='internalNotes' rows={2} placeholder='Vehicle notes…' className='gb-input w-full' />
                    <button type='submit' className='mt-2 text-xs font-black uppercase text-gold-soft'>Save notes</button>
                  </form>
                </article>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title='Customer & address' subtitle='Edit booking contact' defaultOpen={false}>
            <form action={updateDetailsAction} className='grid gap-3 sm:grid-cols-2'>
              <input type='hidden' name='id' value={data.id} />
              <input type='hidden' name='source' value={data.isFallback ? 'fallback' : 'appointment'} />
              <input name='guestName' defaultValue={data.guestName} placeholder='Name' className='gb-input' />
              <input name='guestPhone' defaultValue={data.guestPhone} placeholder='Phone' className='gb-input' />
              <input name='guestEmail' defaultValue={data.guestEmail} placeholder='Email' className='gb-input sm:col-span-2' />
              <input name='serviceAddress' defaultValue={data.serviceAddress} placeholder='Street' className='gb-input sm:col-span-2' />
              <input name='serviceCity' defaultValue={data.serviceCity} placeholder='City' className='gb-input' />
              <input name='serviceState' defaultValue={data.serviceState} placeholder='State' className='gb-input' />
              <input name='serviceZip' defaultValue={data.serviceZip} placeholder='ZIP' className='gb-input' />
              <button type='submit' className='sm:col-span-2 rounded-2xl bg-gold px-4 py-3 text-xs font-black uppercase text-black'>Save customer</button>
            </form>
          </CollapsibleSection>

          <CollapsibleSection title='Vehicles & pricing' subtitle='Add or edit vehicles' defaultOpen={false}>
            <WorkOrderVehiclesForm
              id={data.id}
              source={data.isFallback ? 'fallback' : 'appointment'}
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
              }))}
            />
          </CollapsibleSection>
        </div>

        <aside className='space-y-6 lg:col-span-4'>
          <div className='fixed bottom-24 right-4 z-30 lg:sticky lg:top-24 lg:bottom-auto lg:right-auto'>
            <GlassCard className='border-gold/30 p-4 shadow-[0_0_30px_rgba(212,175,55,0.2)]'>
              <div className='flex items-center gap-2'>
                <Clock className='h-5 w-5 text-gold-soft' />
                <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Live timer</p>
              </div>
              <div className='mt-3'>
                <TechTimerControls
                  appointmentId={data.isFallback ? null : data.id}
                  fallbackBookingId={data.isFallback ? data.id : null}
                  workflowSessionId={data.workflowSessionId}
                  initialTimerId={data.openTimerId || null}
                  initialStartedAt={data.openTimerStartedAt || null}
                />
              </div>
            </GlassCard>
          </div>

          <GlassCard>
            <SectionEyebrow>Agreement</SectionEyebrow>
            <div className='mt-4 flex flex-col gap-2'>
              <Link href={data.agreementCaptureHref} className='rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-center text-xs font-black uppercase text-gold-soft'>
                Capture agreement
              </Link>
              <Link href={data.agreementDetailHref} className='rounded-2xl border border-white/15 px-4 py-3 text-center text-xs font-black uppercase text-zinc-200'>
                View / print
              </Link>
            </div>
          </GlassCard>

          <CollapsibleSection title='Notifications' subtitle='History & send' defaultOpen={false}>
            <ToastActionForm action={techSendActiveJobNotificationAction} className='flex flex-col gap-2'>
              <input type='hidden' name='kind' value={notifyKind} />
              {!data.isFallback ? <input type='hidden' name='appointmentId' value={data.id} /> : null}
              {data.isFallback ? <input type='hidden' name='fallbackBookingId' value={data.id} /> : null}
              <select value={notifyKind} onChange={(e) => setNotifyKind(e.target.value)} className='gb-input'>
                {NOTIFY_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
              <SubmitStatusButton pendingText='Sending…' className='rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase text-white'>
                <Bell className='mr-1 inline h-3.5 w-3.5' /> Send notification
              </SubmitStatusButton>
            </ToastActionForm>
            <ul className='mt-4 max-h-48 space-y-2 overflow-y-auto text-xs'>
              {data.outbox.length === 0 ? <li className='text-zinc-500'>No sends yet.</li> : null}
              {data.outbox.map((n) => (
                <li key={n.id} className='rounded-xl border border-white/10 bg-black/30 px-3 py-2'>
                  <span className='font-bold text-white'>{n.kind}</span> · {n.status}
                  <p className='text-zinc-500'>{n.time}</p>
                  {n.skipped ? <p className='text-amber-200'>{n.skipped}</p> : null}
                </li>
              ))}
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title='Payment' subtitle='Cash & completion' defaultOpen>
            <form action={recordCashAction} className='grid gap-2'>
              {!data.isFallback ? <input type='hidden' name='appointmentId' value={data.id} /> : null}
              {data.isFallback ? <input type='hidden' name='fallbackBookingId' value={data.id} /> : null}
              <input name='amountReceived' placeholder='Amount received' className='gb-input' />
              <input name='changeGiven' placeholder='Change' className='gb-input' />
              <input name='cashNote' placeholder='Note' className='gb-input' />
              <button type='submit' className='rounded-2xl bg-emerald-500 px-4 py-3 text-xs font-black uppercase text-black'>
                Record cash
              </button>
            </form>
            <div className='mt-4'>
              <TechJobWorkspace job={data.job} hasIntake={data.hasIntake} />
            </div>
            {!data.isFallback ? (
              <form action={completeJobAction} className='mt-4'>
                <input type='hidden' name='appointmentId' value={data.id} />
                {data.workflowSessionId ? <input type='hidden' name='workflowSessionId' value={data.workflowSessionId} /> : null}
                <button type='submit' className='flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-4 text-sm font-black uppercase text-black'>
                  <CheckCircle2 className='h-5 w-5' /> Complete job
                </button>
              </form>
            ) : (
              <p className='mt-4 text-xs text-amber-100'>Link to appointment before final completion.</p>
            )}
          </CollapsibleSection>

          <CollapsibleSection title='Notes' defaultOpen={false}>
            <ul className='max-h-56 space-y-2 overflow-y-auto text-sm'>
              {data.notes.length === 0 ? <li className='text-zinc-500'>No notes.</li> : null}
              {data.notes.map((n) => (
                <li key={n.id} className='rounded-xl border border-white/10 bg-black/30 px-3 py-2'>
                  <p className='text-[10px] font-bold uppercase text-gold-soft'>{n.vehicleLabel}</p>
                  <p className='text-zinc-500'>{n.time}</p>
                  <p className='mt-1 text-zinc-300'>{n.body}</p>
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        </aside>
      </div>

      <StickyActionBar>
        <Link href={data.agreementCaptureHref} className='rounded-xl border border-gold/40 px-4 py-2.5 text-[10px] font-black uppercase text-gold-soft'>
          Agreement
        </Link>
        <NotificationSendForm
          kind='payment_link'
          appointmentId={!data.isFallback ? data.id : undefined}
          fallbackBookingId={data.isFallback ? data.id : undefined}
          buttonClassName='rounded-xl bg-gold px-4 py-2.5 text-[10px] font-black uppercase text-black'
        >
          Pay now
        </NotificationSendForm>
        <NotificationSendForm
          kind='last_touches'
          appointmentId={!data.isFallback ? data.id : undefined}
          fallbackBookingId={data.isFallback ? data.id : undefined}
          buttonClassName='rounded-xl border border-white/20 px-4 py-2.5 text-[10px] font-black uppercase text-zinc-200'
        >
          Last touches
        </NotificationSendForm>
      </StickyActionBar>
    </div>
  );
}

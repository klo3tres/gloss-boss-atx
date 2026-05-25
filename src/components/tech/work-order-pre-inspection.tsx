'use client';

import { Camera, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { useActionState, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BEFORE_SLOT_LABELS,
  REQUIRED_BEFORE_SLOTS,
  type RequiredBeforeSlot,
} from '@/lib/pre-inspection';
import { savePreInspectionDamageAckAction } from '@/app/(dashboard)/tech/work-order-pre-inspection-actions';
import { techSaveChecklistSnapshotAction, techStartJobAction } from '@/app/(dashboard)/tech/tech-actions';
import { checklistForServiceSlug } from '@/lib/tech-service-checklist';

type SlotState = Record<RequiredBeforeSlot, boolean>;

export type PreInspectionPanelProps = {
  appointmentId?: string | null;
  fallbackBookingId?: string | null;
  workOrderId: string;
  customerId?: string | null;
  workflowSessionId?: string | null;
  vehicleIndex: number;
  vehicleLabel: string;
  serviceSlug: string;
  technicianName: string;
  jobStatus: string;
  agreementSigned: boolean;
  slotFilled: SlotState;
  photoProgress: string;
  damageAck: {
    damageNotes: string;
    noVisibleDamage: boolean;
    customerAcknowledged: boolean;
    customerSignatureName: string;
    witnessName: string;
    acknowledgedAt: string;
    damageAckComplete: boolean;
  };
  canAdminOverride: boolean;
  preInspectionOverridden: boolean;
  missingStartItems: string[];
  canStartJob: boolean;
  isJobStarted: boolean;
  checklistSaved: boolean;
};

export function WorkOrderPreInspection({
  appointmentId,
  fallbackBookingId,
  workOrderId,
  customerId,
  workflowSessionId,
  vehicleIndex,
  vehicleLabel,
  serviceSlug,
  technicianName,
  jobStatus,
  agreementSigned,
  slotFilled,
  photoProgress,
  damageAck,
  canAdminOverride,
  preInspectionOverridden,
  missingStartItems,
  canStartJob,
  isJobStarted,
  checklistSaved,
}: PreInspectionPanelProps) {
  const router = useRouter();
  const [activeSlot, setActiveSlot] = useState<RequiredBeforeSlot>('front');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [damageNotes, setDamageNotes] = useState(damageAck.damageNotes);
  const [noVisibleDamage, setNoVisibleDamage] = useState(damageAck.noVisibleDamage);
  const [customerAck, setCustomerAck] = useState(damageAck.customerAcknowledged);
  const [signatureName, setSignatureName] = useState(damageAck.customerSignatureName);
  const [witnessName, setWitnessName] = useState(damageAck.witnessName);
  const [overrideReason, setOverrideReason] = useState('');
  const [startState, startFormAction, startPending] = useActionState(techStartJobAction, null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [chkPending, setChkPending] = useState(false);

  const [ackState, ackAction, ackPending] = useActionState(savePreInspectionDamageAckAction, null);

  const checklist = useMemo(() => checklistForServiceSlug(serviceSlug), [serviceSlug]);
  const filledCount = REQUIRED_BEFORE_SLOTS.filter((s) => slotFilled[s]).length;

  const uploadSlot = async (file: File | undefined | null) => {
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    const fd = new FormData();
    fd.set('workOrderId', workOrderId);
    if (appointmentId) fd.set('appointmentId', appointmentId);
    if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
    if (customerId) fd.set('customerId', customerId);
    if (workflowSessionId) {
      fd.set('workflowSessionId', workflowSessionId);
      fd.set('techWorkflowSessionId', workflowSessionId);
    }
    fd.set('category', 'before');
    fd.set('photoCategory', activeSlot);
    fd.set('vehicleIndex', String(vehicleIndex));
    fd.set('vehicleLabel', vehicleLabel);
    fd.set('file', file);
    try {
      const res = await fetch('/api/tech/job-media-upload', { method: 'POST', body: fd });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; photoId?: string; mediaId?: string };
      if (!res.ok || json.ok === false) {
        setUploadMsg({ tone: 'err', text: json.error ?? `Upload failed (${res.status}).` });
        return;
      }
      setUploadMsg({ tone: 'ok', text: `${BEFORE_SLOT_LABELS[activeSlot]} photo saved.` });
      router.refresh();
    } catch (e) {
      setUploadMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Network error.' });
    } finally {
      setUploading(false);
    }
  };

  const saveChecklist = () => {
    if (!appointmentId) return;
    const items = checklist.filter((item) => checked[item]);
    setChkPending(true);
    void techSaveChecklistSnapshotAction(appointmentId, JSON.stringify(items)).then(() => {
      setChkPending(false);
      router.refresh();
    });
  };

  const showStart = !isJobStarted && ['assigned', 'confirmed'].includes(jobStatus);

  return (
    <div className='space-y-4'>
      <div className='rounded-2xl border border-gold/35 bg-gradient-to-b from-gold/10 to-black/60 p-4'>
        <div className='flex items-center justify-between gap-2'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Pre-inspection (required)</p>
          <span className='rounded-full border border-gold/40 bg-black/50 px-3 py-1 text-sm font-black text-gold-soft'>
            {photoProgress}
          </span>
        </div>
        <p className='mt-2 text-xs text-zinc-400'>
          {vehicleLabel} · Technician: {technicianName}
          {!agreementSigned ? (
            <span className='mt-1 block text-amber-200'>Agreement must be signed before starting.</span>
          ) : null}
          {preInspectionOverridden ? (
            <span className='mt-1 block text-amber-200'>Admin override on file for pre-inspection.</span>
          ) : null}
        </p>
      </div>

      <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
        {REQUIRED_BEFORE_SLOTS.map((slot) => {
          const done = slotFilled[slot];
          return (
            <button
              key={slot}
              type='button'
              onClick={() => setActiveSlot(slot)}
              className={`rounded-xl border px-2 py-3 text-left transition ${
                activeSlot === slot
                  ? 'border-gold bg-gold/15'
                  : done
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-white/15 bg-black/40'
              }`}
            >
              <p className='text-[9px] font-black uppercase tracking-wide text-zinc-400'>{BEFORE_SLOT_LABELS[slot]}</p>
              <p className={`mt-1 text-[10px] font-bold ${done ? 'text-emerald-300' : 'text-zinc-500'}`}>
                {done ? 'Done' : 'Needed'}
              </p>
            </button>
          );
        })}
      </div>

      <label className='flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gold/50 bg-black/50 px-4 py-8 transition hover:border-gold'>
        <Camera className='h-8 w-8 text-gold-soft' />
        <span className='text-sm font-black uppercase text-gold-soft'>
          {uploading ? 'Uploading…' : `Photo: ${BEFORE_SLOT_LABELS[activeSlot]}`}
        </span>
        <span className='text-[10px] text-zinc-500'>{filledCount} of 8 before photos</span>
        <input
          type='file'
          accept='image/*'
          capture='environment'
          className='sr-only'
          disabled={uploading}
          onChange={(e) => {
            void uploadSlot(e.currentTarget.files?.[0]);
            e.currentTarget.value = '';
          }}
        />
      </label>
      {uploading ? (
        <p className='flex items-center gap-2 text-xs text-gold-soft'>
          <Loader2 className='h-4 w-4 animate-spin' /> Saving photo…
        </p>
      ) : null}
      {uploadMsg ? (
        <p
          className={`rounded-xl border px-3 py-2 text-xs ${
            uploadMsg.tone === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100' : 'border-red-500/40 bg-red-500/10 text-red-100'
          }`}
        >
          {uploadMsg.text}
        </p>
      ) : null}

      <div className='rounded-2xl border border-rose-900/40 bg-rose-950/20 p-4'>
        <p className='flex items-center gap-2 text-xs font-black uppercase tracking-wider text-rose-200'>
          <ShieldAlert className='h-4 w-4' /> Pre-existing damage
        </p>
        <p className='mt-1 text-[10px] text-zinc-500'>
          Customer acknowledges existing damage before service. Link photos in the Existing damage slot above.
        </p>
        <form action={ackAction} className='mt-3 space-y-3'>
          {appointmentId ? <input type='hidden' name='appointmentId' value={appointmentId} /> : null}
          {fallbackBookingId ? <input type='hidden' name='fallbackBookingId' value={fallbackBookingId} /> : null}
          <input type='hidden' name='vehicleIndex' value={String(vehicleIndex)} />
          <input type='hidden' name='vehicleLabel' value={vehicleLabel} />
          <input type='hidden' name='linkedPhotoIds' value='[]' />
          <label className='block text-xs text-zinc-400'>
            Damage notes
            <textarea
              name='damageNotes'
              value={damageNotes}
              onChange={(e) => setDamageNotes(e.target.value)}
              rows={3}
              disabled={noVisibleDamage}
              placeholder='Scratches, dents, stains, trim wear…'
              className='mt-1 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-sm text-white disabled:opacity-50'
            />
          </label>
          <label className='flex items-center gap-2 text-xs text-zinc-300'>
            <input
              type='checkbox'
              name='noVisibleDamage'
              value='true'
              checked={noVisibleDamage}
              onChange={(e) => setNoVisibleDamage(e.target.checked)}
            />
            No visible damage observed
          </label>
          <label className='flex items-center gap-2 text-xs text-zinc-300'>
            <input
              type='checkbox'
              name='customerAcknowledged'
              value='true'
              checked={customerAck}
              onChange={(e) => setCustomerAck(e.target.checked)}
            />
            Customer acknowledges pre-existing damage before service begins
          </label>
          <label className='block text-xs text-zinc-400'>
            Customer name (signature)
            <input
              name='customerSignatureName'
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              className='mt-1 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <label className='block text-xs text-zinc-400'>
            Witness (optional)
            <input
              name='witnessName'
              value={witnessName}
              onChange={(e) => setWitnessName(e.target.value)}
              className='mt-1 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          {damageAck.acknowledgedAt ? (
            <p className='text-[10px] text-zinc-500'>Last saved: {damageAck.acknowledgedAt}</p>
          ) : null}
          <button
            type='submit'
            disabled={ackPending}
            className='w-full rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-3 text-xs font-black uppercase text-rose-100 disabled:opacity-50'
          >
            {ackPending ? 'Saving…' : damageAck.damageAckComplete ? 'Update acknowledgement' : 'Save acknowledgement'}
          </button>
          {ackState?.error ? <p className='text-xs text-red-200'>{ackState.error}</p> : null}
          {ackState?.ok ? <p className='text-xs text-emerald-200'>Damage acknowledgement saved.</p> : null}
        </form>
      </div>

      {isJobStarted && appointmentId ? (
        <div className='rounded-2xl border border-white/10 bg-black/40 p-4'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Service checklist</p>
          <ul className='mt-2 space-y-1'>
            {checklist.map((item) => (
              <li key={item} className='flex items-center gap-2 text-sm text-zinc-300'>
                <input
                  type='checkbox'
                  checked={Boolean(checked[item])}
                  onChange={(e) => setChecked((c) => ({ ...c, [item]: e.target.checked }))}
                  className='rounded border-zinc-600'
                />
                {item}
              </li>
            ))}
          </ul>
          <button
            type='button'
            disabled={chkPending}
            onClick={saveChecklist}
            className='mt-3 w-full rounded-xl border border-white/20 px-4 py-2 text-xs font-black uppercase text-zinc-200'
          >
            {chkPending ? 'Saving…' : checklistSaved ? 'Update checklist' : 'Save checklist'}
          </button>
        </div>
      ) : null}

      {showStart ? (
        <div className='rounded-2xl border border-gold/30 bg-black/50 p-4'>
          {!canStartJob && missingStartItems.length > 0 ? (
            <div className='mb-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100'>
              <p className='font-bold uppercase'>Cannot start yet</p>
              <ul className='mt-2 list-inside list-disc space-y-1'>
                {missingStartItems.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {canAdminOverride ? (
            <label className='mb-3 block text-xs text-amber-100'>
              Admin override reason (skips photo + damage requirements)
              <input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className='mt-1 w-full rounded-xl border border-amber-500/30 bg-black px-3 py-2 text-sm text-white'
                placeholder='e.g. repeat customer, photos from prior visit'
              />
            </label>
          ) : null}
          <form action={startFormAction} className='space-y-2'>
            {appointmentId ? <input type='hidden' name='appointmentId' value={appointmentId} /> : null}
            {fallbackBookingId ? <input type='hidden' name='fallbackBookingId' value={fallbackBookingId} /> : null}
            {!appointmentId && !fallbackBookingId ? <input type='hidden' name='appointmentId' value={workOrderId} /> : null}
            {workflowSessionId ? <input type='hidden' name='workflowSessionId' value={workflowSessionId} /> : null}
            <input type='hidden' name='jobReference' value={workOrderId} />
            {canAdminOverride && overrideReason.trim() ? (
              <>
                <input type='hidden' name='preInspectionOverride' value='true' />
                <input type='hidden' name='preInspectionOverrideReason' value={overrideReason.trim()} />
              </>
            ) : null}
            <button
              type='submit'
              disabled={startPending || (!canStartJob && !(canAdminOverride && overrideReason.trim()))}
              className='flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-4 text-sm font-black uppercase text-black disabled:opacity-40'
            >
              {startPending ? <Loader2 className='h-5 w-5 animate-spin' /> : <CheckCircle2 className='h-5 w-5' />}
              {startPending ? 'Starting…' : 'Start job'}
            </button>
          </form>
          {startState?.error ? <p className='mt-2 text-xs text-red-200'>{startState.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

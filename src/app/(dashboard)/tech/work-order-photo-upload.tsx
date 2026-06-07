'use client';

import { Camera, ImagePlus, Loader2, X, Trash2, CheckCircle2, Upload, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, DragEvent } from 'react';
import { PHOTO_SLOT_OPTIONS } from '@/lib/photo-phase';
import { compressImageForUpload, formatFileSize } from '@/lib/image-compress-client';
import type { WorkOrderGalleryPhoto } from './work-order-gallery';

type UploadJson = { ok?: boolean; url?: string; error?: string; photoId?: string; mediaId?: string };

type PendingFile = {
  id: string;
  file: File;
  previewUrl: string;
  phase: 'before' | 'after';
  category: string;
  status: 'pending' | 'compressing' | 'uploading' | 'success' | 'error';
  progress: number;
  errorText?: string;
  compressedSizeHint?: string;
};

const REQUIRED_SLOTS = ['front', 'driver_side', 'passenger_side', 'rear', 'wheels', 'interior'];

function pretty(value: string) {
  return (value || 'Photo').replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function WorkOrderPhotoUpload({
  appointmentId,
  fallbackBookingId,
  workOrderId,
  customerId,
  workflowSessionId,
  source,
  resolvedContextTrust,
  vehicleIndex,
  vehicleLabel,
  existingPhotos = [],
}: {
  appointmentId?: string | null;
  fallbackBookingId?: string | null;
  workOrderId?: string | null;
  customerId?: string | null;
  workflowSessionId?: string | null;
  source?: 'appointment' | 'fallback';
  resolvedContextTrust?: boolean;
  vehicleIndex: number;
  vehicleLabel: string;
  existingPhotos?: WorkOrderGalleryPhoto[];
}) {
  const [phase, setPhase] = useState<'before' | 'after'>('before');
  const [category, setCategory] = useState('front');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [status, setStatus] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadIndex, setUploadIndex] = useState<number | null>(null);
  const router = useRouter();

  const handlePhaseChange = (p: 'before' | 'after') => {
    setPhase(p);
    setCategory('front'); // Reset category to front as requested
    setStatus(null);
  };

  // Helper to find the next unfilled required slot
  const getNextUnfilledSlot = (currentCategory: string, currentPending: PendingFile[]) => {
    // Combine existing slots for this phase with currently queued pending slots
    const filledSlots = new Set<string>();
    
    // Add existing photos in this phase
    existingPhotos.forEach((p) => {
      const pPhase = p.phase || (p.category === 'after' ? 'after' : 'before');
      if (pPhase === phase) {
        filledSlots.add(p.category);
      }
    });

    // Add pending photos in this phase
    currentPending.forEach((p) => {
      if (p.phase === phase) {
        filledSlots.add(p.category);
      }
    });

    // Find first required slot not yet filled
    const nextUnfilled = REQUIRED_SLOTS.find(slot => !filledSlots.has(slot));
    if (nextUnfilled) return nextUnfilled;

    // Fallback: advance to the next slot in sequence
    const currentIdx = REQUIRED_SLOTS.indexOf(currentCategory);
    if (currentIdx !== -1) {
      return REQUIRED_SLOTS[(currentIdx + 1) % REQUIRED_SLOTS.length];
    }
    return REQUIRED_SLOTS[0];
  };

  const addFilesToQueue = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    
    const newPending: PendingFile[] = [];
    let currentCategory = category;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = `${file.name}-${Date.now()}-${i}`;
      const previewUrl = URL.createObjectURL(file);
      
      const newFile: PendingFile = {
        id,
        file,
        previewUrl,
        phase,
        category: currentCategory,
        status: 'pending',
        progress: 0,
      };
      
      newPending.push(newFile);

      // Auto-advance slot category suggestion for the next file
      currentCategory = getNextUnfilledSlot(currentCategory, [...pendingFiles, ...newPending]);
    }

    setPendingFiles(prev => [...prev, ...newPending]);
    setCategory(currentCategory); // Auto-advance the main selector
    setStatus(null);
  };

  const removePendingFile = (id: string) => {
    setPendingFiles(prev => {
      const target = prev.find(p => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  };

  const updatePendingFileMeta = (id: string, updates: Partial<Pick<PendingFile, 'category' | 'phase'>>) => {
    setPendingFiles(prev =>
      prev.map(p => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  const uploadQueue = async () => {
    const toUpload = pendingFiles.filter(p => p.status === 'pending' || p.status === 'error');
    if (toUpload.length === 0) return;

    const woId = workOrderId || appointmentId || fallbackBookingId;
    if (!woId) {
      setStatus({ tone: 'error', text: 'No job linked — open the work order and try again.' });
      return;
    }

    setBusy(true);
    setStatus(null);

    // sequential uploads
    for (let i = 0; i < pendingFiles.length; i++) {
      const pending = pendingFiles[i];
      if (pending.status === 'success') continue;

      setUploadIndex(i);
      
      // Update status to compressing
      setPendingFiles(prev =>
        prev.map(p => (p.id === pending.id ? { ...p, status: 'compressing' } : p))
      );

      let uploadFile = pending.file;
      let hint = '';
      try {
        const compressed = await compressImageForUpload(pending.file);
        uploadFile = compressed.file;
        hint = compressed.compressed
          ? `${formatFileSize(compressed.beforeBytes)} → ${formatFileSize(compressed.afterBytes)}`
          : formatFileSize(compressed.beforeBytes);
      } catch (e) {
        setPendingFiles(prev =>
          prev.map(p => (p.id === pending.id ? { ...p, status: 'error', errorText: 'Compression failed' } : p))
        );
        continue;
      }

      // Update status to uploading
      setPendingFiles(prev =>
        prev.map(p => (p.id === pending.id ? { ...p, status: 'uploading', compressedSizeHint: hint } : p))
      );

      const fd = new FormData();
      fd.set('workOrderId', woId);
      if (appointmentId) fd.set('appointmentId', appointmentId);
      if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
      if (source) fd.set('source', source);
      if (customerId) fd.set('customerId', customerId);
      if (resolvedContextTrust) fd.set('resolvedContextTrust', 'true');
      if (workflowSessionId) {
        fd.set('workflowSessionId', workflowSessionId);
        fd.set('techWorkflowSessionId', workflowSessionId);
      }
      fd.set('category', pending.phase); // category is phase
      fd.set('photoCategory', pending.category); // photoCategory is slot
      fd.set('vehicleIndex', String(vehicleIndex));
      fd.set('vehicleLabel', vehicleLabel);
      fd.set('file', uploadFile);

      try {
        const res = await fetch('/api/tech/job-media-upload', { method: 'POST', body: fd });
        const json = (await res.json().catch(() => ({}))) as UploadJson;
        
        if (!res.ok || json.ok === false) {
          const errText = res.status === 413 ? 'Too large' : json.error ?? 'Failed';
          setPendingFiles(prev =>
            prev.map(p => (p.id === pending.id ? { ...p, status: 'error', errorText: errText } : p))
          );
        } else {
          setPendingFiles(prev =>
            prev.map(p => (p.id === pending.id ? { ...p, status: 'success', progress: 100 } : p))
          );
        }
      } catch (e) {
        setPendingFiles(prev =>
          prev.map(p => (p.id === pending.id ? { ...p, status: 'error', errorText: 'Network error' } : p))
        );
      }
    }

    setUploadIndex(null);
    setBusy(false);

    // Check if any errors occurred
    const hasErrors = pendingFiles.some(p => p.status === 'error');
    if (!hasErrors) {
      setStatus({
        tone: 'success',
        text: `Successfully uploaded ${pendingFiles.length} photos for ${vehicleLabel}.`,
      });
      // Clear queue after full success
      pendingFiles.forEach(p => URL.revokeObjectURL(p.previewUrl));
      setPendingFiles([]);
    } else {
      setStatus({
        tone: 'error',
        text: 'Some uploads failed. Review the errors below and retry.',
      });
    }
    
    router.refresh();
  };

  // Drag & Drop handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    addFilesToQueue(e.dataTransfer.files);
  };

  // Compute stats of uploaded slots for the current phase
  const getSlotCounts = () => {
    const counts: Record<string, number> = {};
    existingPhotos.forEach((p) => {
      const pPhase = p.phase || (p.category === 'after' ? 'after' : 'before');
      if (pPhase === phase) {
        counts[p.category] = (counts[p.category] || 0) + 1;
      }
    });
    return counts;
  };

  const slotCounts = getSlotCounts();

  const statusClass =
    status?.tone === 'error'
      ? 'border-red-500/40 bg-red-500/10 text-red-100'
      : status?.tone === 'success'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
        : 'border-gold/30 bg-gold/10 text-gold-soft';

  return (
    <div className="gb-premium-card mt-3 rounded-2xl border border-white/10 p-4 space-y-4">
      {/* Header and busy status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">
          Tech Photos (Vehicle: {vehicleLabel})
        </p>
        {busy && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase text-gold-soft">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {uploadIndex !== null
              ? `Uploading ${uploadIndex + 1} of ${pendingFiles.length}…`
              : 'Uploading…'}
          </span>
        )}
      </div>

      {/* Phase Selector Tabs */}
      <div className="flex flex-wrap gap-2">
        {(['before', 'after'] as const).map((p) => (
          <button
            key={p}
            type="button"
            disabled={busy}
            onClick={() => handlePhaseChange(p)}
            className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase transition ${
              phase === p ? 'bg-gold text-black shadow-md' : 'border border-white/15 text-zinc-400 hover:border-white/30'
            }`}
          >
            {p === 'before' ? 'Before Restoration' : 'After Restoration'}
          </button>
        ))}
      </div>

      {/* Progress Indicator Strip */}
      <div className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
          Required Slots Status ({phase === 'before' ? 'Before' : 'After'}):
        </span>
        <div className="flex flex-wrap gap-2">
          {REQUIRED_SLOTS.map((slot) => {
            const count = slotCounts[slot] || 0;
            const hasPhoto = count > 0;
            return (
              <span
                key={slot}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-bold uppercase border ${
                  hasPhoto
                    ? 'border-gold/30 bg-gold/5 text-gold-soft'
                    : 'border-white/10 text-zinc-500'
                }`}
              >
                {pretty(slot)}: {count}/1
              </span>
            );
          })}
        </div>
      </div>

      {/* Target Category Selector */}
      <div className="space-y-1.5">
        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
          Selected Target Slot:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PHOTO_SLOT_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy}
              onClick={() => setCategory(c)}
              className={`rounded-lg px-2 py-1 text-[9px] font-bold uppercase transition ${
                category === c
                  ? 'border border-gold/60 bg-gold/15 text-gold-soft'
                  : 'border border-white/10 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {pretty(c)}
            </button>
          ))}
        </div>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-6 text-center transition ${
          dragOver
            ? 'border-gold bg-gold/5 shadow-[0_0_20px_rgba(212,175,55,0.1)]'
            : 'border-white/10 bg-black/20'
        }`}
      >
        <div className="flex flex-col items-center justify-center space-y-2">
          <Upload className={`h-8 w-8 ${dragOver ? 'text-gold' : 'text-zinc-500'}`} />
          <p className="text-xs text-zinc-300">
            Drag and drop images here, or choose an option below
          </p>
          <p className="text-[9px] text-zinc-500">
            Supports JPEG, PNG, WebP
          </p>
        </div>

        {/* Buttons */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2 max-w-md mx-auto">
          <label className="flex min-h-[3rem] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gold/40 bg-gold/5 px-4 py-2 text-xs font-black uppercase tracking-wider text-gold-soft hover:border-gold hover:bg-gold/10 transition">
            <Camera className="h-4 w-4 shrink-0 text-gold" />
            Take photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              capture="environment"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) addFilesToQueue([file]);
                e.currentTarget.value = '';
              }}
            />
          </label>
          <label className="flex min-h-[3rem] cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/50 px-4 py-2 text-xs font-black uppercase tracking-wider text-zinc-300 hover:border-white/40 transition">
            <ImagePlus className="h-4 w-4 shrink-0 text-gold-soft" />
            From library
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/*"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                addFilesToQueue(e.currentTarget.files);
                e.currentTarget.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {/* Queue Section */}
      {pendingFiles.length > 0 && (
        <div className="space-y-3 bg-black/40 border border-white/5 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-gold-soft">
              Pending Upload Queue ({pendingFiles.length} files)
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                pendingFiles.forEach(p => URL.revokeObjectURL(p.previewUrl));
                setPendingFiles([]);
              }}
              className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 hover:text-red-400 transition"
            >
              Clear Queue
            </button>
          </div>

          {/* Thumbnail list */}
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {pendingFiles.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center gap-3 bg-black/60 border border-white/10 rounded-xl p-2.5 relative group"
              >
                {/* Preview Thumbnail */}
                <div className="h-14 w-14 rounded-lg overflow-hidden shrink-0 border border-white/10">
                  <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                </div>

                {/* Metadata selectors */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Phase selector */}
                    <select
                      value={item.phase}
                      disabled={busy}
                      onChange={(e) => updatePendingFileMeta(item.id, { phase: e.target.value as 'before' | 'after' })}
                      className="bg-black border border-white/15 text-[10px] text-zinc-300 font-bold uppercase rounded px-1.5 py-0.5"
                    >
                      <option value="before">Before</option>
                      <option value="after">After</option>
                    </select>

                    {/* Slot selector */}
                    <select
                      value={item.category}
                      disabled={busy}
                      onChange={(e) => updatePendingFileMeta(item.id, { category: e.target.value })}
                      className="bg-black border border-white/15 text-[10px] text-zinc-300 font-bold uppercase rounded px-1.5 py-0.5"
                    >
                      {PHOTO_SLOT_OPTIONS.map((slot) => (
                        <option key={slot} value={slot}>
                          {pretty(slot)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Hints and status info */}
                  <div className="flex items-center gap-2 text-[9px] text-zinc-500">
                    <span>{item.file.name.slice(0, 15)}...</span>
                    {item.compressedSizeHint && (
                      <span className="text-zinc-600">({item.compressedSizeHint})</span>
                    )}
                  </div>
                </div>

                {/* Loading status or action buttons */}
                <div className="shrink-0 flex items-center gap-2 pr-1">
                  {item.status === 'compressing' && (
                    <span className="text-[10px] text-gold-soft font-bold uppercase animate-pulse flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Compress
                    </span>
                  )}
                  {item.status === 'uploading' && (
                    <span className="text-[10px] text-gold-soft font-bold uppercase animate-pulse flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Uploading
                    </span>
                  )}
                  {item.status === 'success' && (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  )}
                  {item.status === 'error' && (
                    <span className="text-[10px] text-red-400 font-bold uppercase flex items-center gap-1" title={item.errorText}>
                      <AlertCircle className="h-4 w-4" /> Fail
                    </span>
                  )}

                  {/* Delete from queue button */}
                  {item.status !== 'success' && !busy && (
                    <button
                      type="button"
                      onClick={() => removePendingFile(item.id)}
                      className="text-zinc-500 hover:text-red-400 p-1"
                      aria-label="Remove from queue"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Trigger button */}
          <button
            type="button"
            onClick={uploadQueue}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gold hover:brightness-110 disabled:brightness-75 disabled:pointer-events-none px-4 py-3.5 text-xs font-black uppercase tracking-wider text-black transition"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Processing Queue…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> Upload Queue ({pendingFiles.filter(p => p.status !== 'success').length} files)
              </>
            )}
          </button>
        </div>
      )}

      {/* Global Status messages */}
      {status && (
        <div className={`rounded-xl border px-3 py-2.5 text-xs flex items-center gap-2 ${statusClass}`} role="status">
          {status.tone === 'error' ? (
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          ) : status.tone === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <Loader2 className="h-4 w-4 text-gold-soft shrink-0 animate-spin" />
          )}
          <span>{status.text}</span>
        </div>
      )}
    </div>
  );
}

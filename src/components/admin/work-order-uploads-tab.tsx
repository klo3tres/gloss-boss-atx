'use client';

import { useState } from 'react';
import { SectionEyebrow } from '@/components/ui/premium';

type Photo = {
  id: string;
  url: string;
  category: string;
  created_at: string;
  uploader?: string;
  appointment_id?: string | null;
  fallback_booking_id?: string | null;
  vehicle_label?: string | null;
  vehicle_index?: number | null;
};

export function WorkOrderUploadsTab({ recentPhotos }: { recentPhotos: any[] }) {
  const [selectedBeforePhoto, setSelectedBeforePhoto] = useState<string | null>(null);
  const [selectedAfterPhoto, setSelectedAfterPhoto] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState('');
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [serviceLabel, setServiceLabel] = useState('');
  const [useWatermark, setUseWatermark] = useState(true);
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [creatingPost, setCreatingPost] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Group photos by job (appointment_id or fallback_booking_id) and then by vehicle
  const photos = (recentPhotos || []) as Photo[];
  
  const jobsMap: Record<string, {
    jobId: string;
    vehicleLabel: string;
    photos: Photo[];
  }> = {};

  photos.forEach((p) => {
    const jId = p.appointment_id || p.fallback_booking_id || 'orphan';
    const vLabel = p.vehicle_label || 'Vehicle';
    const key = `${jId}-${vLabel}`;
    if (!jobsMap[key]) {
      jobsMap[key] = {
        jobId: jId,
        vehicleLabel: vLabel,
        photos: [],
      };
    }
    jobsMap[key].photos.push(p);
  });

  const groupedJobs = Object.values(jobsMap);

  const handleOpenPostModal = (jobId: string, vLabel: string, beforePhotos: Photo[], afterPhotos: Photo[]) => {
    setActiveJobId(jobId);
    setVehicleLabel(vLabel);
    setSelectedBeforePhoto(beforePhotos[0]?.url || null);
    setSelectedAfterPhoto(afterPhotos[0]?.url || null);
    setPostTitle(`${vLabel} · Restoration`);
    setServiceLabel('Premium Detail');
    setUseWatermark(true);
    setPublishImmediately(true);
    setPostError(null);
    setPostSuccess(null);
  };

  const handleCreatePost = async () => {
    if (!selectedBeforePhoto || !selectedAfterPhoto || !postTitle.trim() || !vehicleLabel.trim()) return;
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
          vehicleLabel,
          serviceLabel,
          caption: postTitle,
          watermark: useWatermark,
          published: publishImmediately,
          jobId: activeJobId,
        }),
      });
      const resData = await response.json();
      if (!response.ok || !resData.ok) {
        setPostError(resData.error || 'Failed to create post');
      } else {
        setPostSuccess('Before/After post created successfully!');
        setTimeout(() => {
          setActiveJobId(null);
        }, 1500);
      }
    } catch (err: any) {
      setPostError(err.message || 'Failed to create post');
    } finally {
      setCreatingPost(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="gb-glass bg-zinc-950/40 rounded-2xl border border-white/5 p-6">
        <h2 className="text-lg font-black uppercase tracking-tight text-white">Work Order Uploads</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Pair up `before` and `after` photos uploaded by field technicians to publish featured transformation cards directly onto the marketing gallery.
        </p>
      </div>

      <div className="space-y-4">
        {groupedJobs.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">No technician photo uploads found.</p>
        ) : null}

        {groupedJobs.map((group, idx) => {
          const beforePhotos = group.photos.filter((p) => p.category === 'before' || p.category?.startsWith('before_') || p.category === 'front' || p.category === 'driver_side' || p.category === 'passenger_side' || p.category === 'rear');
          const afterPhotos = group.photos.filter((p) => p.category === 'after' || p.category?.startsWith('after_'));

          return (
            <div key={idx} className="gb-glass rounded-2xl border border-white/10 bg-black/40 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">{group.vehicleLabel}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Job Ref: {group.jobId.slice(0, 8).toUpperCase()}</p>
                </div>
                {beforePhotos.length > 0 && afterPhotos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleOpenPostModal(group.jobId, group.vehicleLabel, beforePhotos, afterPhotos)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black hover:bg-gold-soft transition duration-200"
                  >
                    Create Before/After Post
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Before Photos */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-200">Before Restoration ({beforePhotos.length})</p>
                  {beforePhotos.length === 0 ? (
                    <p className="text-xs text-zinc-600 italic">No before photos.</p>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {beforePhotos.map((p) => (
                        <div key={p.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10">
                          <img src={p.url} className="h-full w-full object-cover" alt="" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* After Photos */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">After Restoration ({afterPhotos.length})</p>
                  {afterPhotos.length === 0 ? (
                    <p className="text-xs text-zinc-600 italic">No after photos.</p>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {afterPhotos.map((p) => (
                        <div key={p.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10">
                          <img src={p.url} className="h-full w-full object-cover" alt="" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Before/After Post Modal */}
      {activeJobId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" onClick={() => setActiveJobId(null)}>
          <div className="gb-glass w-full max-w-2xl rounded-3xl border border-gold/30 bg-black/95 p-6 space-y-4 text-left shadow-[0_0_50px_rgba(212,175,55,0.15)] animate-in fade-in duration-200 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft mb-1">Marketing Integration</p>
              <h3 className="text-lg font-bold text-white">Create Before/After Post</h3>
              <p className="text-xs text-zinc-400 mt-1">Vehicle: {vehicleLabel}</p>
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
                  {photos.filter((p) => (p.appointment_id === activeJobId || p.fallback_booking_id === activeJobId) && (p.category === 'before' || p.category === 'front' || p.category === 'driver_side' || p.category === 'passenger_side' || p.category === 'rear')).map((p) => {
                    const isSelected = selectedBeforePhoto === p.url;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedBeforePhoto(p.url)}
                        className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                          isSelected ? 'border-gold shadow-[0_0_12px_rgba(212,175,55,0.4)]' : 'border-white/10 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={p.url} className="h-full w-full object-cover" alt="" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Select After Image */}
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-zinc-400 mb-2">Select After Image</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {photos.filter((p) => (p.appointment_id === activeJobId || p.fallback_booking_id === activeJobId) && (p.category === 'after')).map((p) => {
                    const isSelected = selectedAfterPhoto === p.url;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedAfterPhoto(p.url)}
                        className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                          isSelected ? 'border-gold shadow-[0_0_12px_rgba(212,175,55,0.4)]' : 'border-white/10 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={p.url} className="h-full w-full object-cover" alt="" />
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

              {/* Service Label */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-zinc-400 mb-1">
                  Service Name / Slug
                </label>
                <input
                  type="text"
                  value={serviceLabel}
                  onChange={(e) => setServiceLabel(e.target.value)}
                  className="gb-input w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white placeholder-zinc-500 focus:outline-none focus:border-gold"
                  placeholder="e.g. Ceramic Coating"
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
                onClick={() => setActiveJobId(null)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black uppercase text-zinc-400 hover:text-white transition duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creatingPost || !selectedBeforePhoto || !selectedAfterPhoto || !postTitle.trim()}
                onClick={handleCreatePost}
                className="rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase text-black hover:bg-gold-soft transition duration-200 shadow-[0_0_15px_rgba(212,175,55,0.3)] disabled:opacity-40"
              >
                {creatingPost ? 'Creating...' : 'Create Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

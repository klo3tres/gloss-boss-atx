'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { safeImageUrl } from '@/lib/gallery-normalize';

export type GalleryAdminItem = {
  id: string;
  caption: string | null;
  url: string;
  sort_order: number;
  published: boolean;
  featured: boolean;
  watermark?: boolean;
  vehicleLabel?: string | null;
  serviceLabel?: string | null;
  transformationPhase?: string | null;
};

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
  customer_name?: string;
  customer_email?: string;
  service_type?: string;
};

async function galleryMutate(
  body: {
    op: string;
    id?: string;
    caption?: string;
    published?: boolean;
    featured?: boolean;
    order?: string[];
    direction?: 'up' | 'down';
    vehicleLabel?: string | null;
    serviceLabel?: string | null;
    transformationPhase?: string | null;
    watermark?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetchWithTimeout('/api/admin/gallery/mutate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    timeoutMs: 60000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Request failed (${res.status})` };
  }
  return { ok: true };
}

export function GalleryAdminManager({ rows, recentPhotos = [] }: { rows: GalleryAdminItem[]; recentPhotos?: any[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'manage' | 'wizard'>('manage');
  const [items, setItems] = useState(rows);
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Filters State for Manage Tab
  const [searchTerm, setSearchTerm] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Wizard Flow States
  const [wizardStep, setWizardStep] = useState<'select' | 'preview' | 'configure' | 'publish'>('select');
  const [wizardSearch, setWizardSearch] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedBeforeUrl, setSelectedBeforeUrl] = useState<string | null>(null);
  const [selectedAfterUrl, setSelectedAfterUrl] = useState<string | null>(null);
  
  // Metadata States
  const [wTitle, setWTitle] = useState('');
  const [wVehicleLabel, setWVehicleLabel] = useState('');
  const [wServiceLabel, setWServiceLabel] = useState('');
  const [wVehicleType, setWVehicleType] = useState('sedan');
  const [wServiceCategory, setWServiceCategory] = useState('full detail');
  const [wTags, setWTags] = useState('');
  const [wWatermark, setWWatermark] = useState(true);
  const [wPublishImmediately, setWPublishImmediately] = useState(true);
  const [wAddToFeatured, setWAddToFeatured] = useState(true);

  // Preview Slider State
  const [sliderVal, setSliderVal] = useState(50);
  const [publishing, setPublishing] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setItems(rows);
  }, [rows]);

  // Group work order photos
  const groupedJobs = (() => {
    const jobsMap: Record<string, {
      groupKey: string;
      jobId: string;
      customerName: string;
      vehicleLabel: string;
      serviceType: string;
      photos: Photo[];
    }> = {};

    (recentPhotos as Photo[]).forEach((p) => {
      const jId = p.appointment_id || p.fallback_booking_id || 'unassigned';
      const vLabel = p.vehicle_label || 'Vehicle Detail';
      const vehicleToken = p.vehicle_index != null ? `vehicle-${p.vehicle_index}` : vLabel;
      const key = `${jId}-${vehicleToken}`;
      if (!jobsMap[key]) {
        jobsMap[key] = {
          groupKey: key,
          jobId: jId,
          customerName: p.customer_name || 'Walk-in Customer',
          vehicleLabel: vLabel,
          serviceType: p.service_type || 'Mobile Detailing',
          photos: [],
        };
      }
      jobsMap[key].photos.push(p);
    });

    return Object.values(jobsMap).filter((job) => {
      if (!wizardSearch) return true;
      const q = wizardSearch.toLowerCase();
      return (
        job.customerName.toLowerCase().includes(q) ||
        job.vehicleLabel.toLowerCase().includes(q) ||
        job.serviceType.toLowerCase().includes(q) ||
        job.jobId.toLowerCase().includes(q)
      );
    });
  })();

  // Autocomplete metadata when a job is picked
  const handleJobSelect = (job: typeof groupedJobs[number]) => {
    setSelectedJobId(job.jobId);
    setSelectedGroupKey(job.groupKey);
    
    // Auto-pre-select before and after photos if they exist
    const befores = job.photos.filter((p) => p.category === 'before' || p.category === 'front' || p.category === 'driver_side' || p.category === 'passenger_side' || p.category === 'rear');
    const afters = job.photos.filter((p) => p.category === 'after');
    setSelectedBeforeUrl(befores[0]?.url || job.photos[0]?.url || null);
    setSelectedAfterUrl(afters[0]?.url || job.photos[1]?.url || null);

    setWVehicleLabel(job.vehicleLabel);
    setWServiceLabel(job.serviceType);
    setWTitle(`${job.vehicleLabel} · ${job.serviceType}`);
    
    // Auto map categories
    const sType = job.serviceType.toLowerCase();
    if (sType.includes('coating') || sType.includes('ceramic')) {
      setWServiceCategory('ceramic coating');
    } else if (sType.includes('interior')) {
      setWServiceCategory('interior');
    } else if (sType.includes('exterior')) {
      setWServiceCategory('exterior');
    } else {
      setWServiceCategory('full detail');
    }
  };

  const handlePublishTransformation = async () => {
    if (!selectedBeforeUrl || !selectedAfterUrl || !wTitle.trim()) {
      setPublishFeedback({ kind: 'err', text: 'Before/After images and public title are required.' });
      return;
    }

    setPublishing(true);
    setPublishFeedback(null);

    const destination = wAddToFeatured ? 'homepage featured' : 'gallery';

    try {
      const response = await fetch('/api/admin/gallery/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'create-before-after',
          beforeUrl: selectedBeforeUrl,
          afterUrl: selectedAfterUrl,
          vehicleLabel: wVehicleLabel,
          serviceLabel: wServiceLabel,
          vehicleClass: wVehicleType,
          serviceCategory: wServiceCategory,
          destination,
          tags: wTags,
          caption: wTitle,
          watermark: wWatermark,
          published: wPublishImmediately,
          jobId: selectedJobId === 'unassigned' ? undefined : selectedJobId,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setPublishFeedback({ kind: 'err', text: data.error || 'Failed to publish post.' });
      } else {
        setPublishFeedback({ kind: 'ok', text: 'Transformation published successfully! Site is updating...' });
        router.refresh();
        setTimeout(() => {
          // Reset wizard and back to list
          setSelectedJobId(null);
          setSelectedGroupKey(null);
          setSelectedBeforeUrl(null);
          setSelectedAfterUrl(null);
          setWTitle('');
          setWVehicleLabel('');
          setWServiceLabel('');
          setWTags('');
          setWizardStep('select');
          setActiveTab('manage');
          setPublishFeedback(null);
        }, 1800);
      }
    } catch (err: any) {
      setPublishFeedback({ kind: 'err', text: err.message || 'Network error publishing transformation.' });
    } finally {
      setPublishing(false);
    }
  };

  const onDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setItems((prev) => {
      const from = prev.findIndex((x) => x.id === dragId);
      const to = prev.findIndex((x) => x.id === overId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((r, i) => ({ ...r, sort_order: (i + 1) * 10 }));
    });
  };

  const saveOrder = useCallback(async () => {
    setSaving(true);
    setFeedback(null);
    const r = await galleryMutate({ op: 'reorder', order: items.map((x) => x.id) });
    if (r.ok) {
      setFeedback({ kind: 'ok', text: 'Gallery order saved. Public site will refresh on next visit.' });
      router.refresh();
    } else {
      setFeedback({ kind: 'err', text: r.error ?? 'Could not save order.' });
    }
    setSaving(false);
  }, [items, router]);

  const togglePublished = async (row: GalleryAdminItem) => {
    setBusyId(row.id);
    setFeedback(null);
    const next = !row.published;
    const r = await galleryMutate({ op: 'toggle-published', id: row.id, published: next });
    if (r.ok) {
      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, published: next } : x)));
      setFeedback({ kind: 'ok', text: next ? 'Image published.' : 'Image unpublished.' });
      router.refresh();
    } else {
      setFeedback({ kind: 'err', text: r.error ?? 'Publish toggle failed.' });
    }
    setBusyId(null);
  };

  const toggleFeatured = async (row: GalleryAdminItem) => {
    setBusyId(row.id);
    setFeedback(null);
    const next = !row.featured;
    const r = await galleryMutate({ op: 'toggle-featured', id: row.id, featured: next });
    if (r.ok) {
      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, featured: next } : x)));
      setFeedback({ kind: 'ok', text: next ? 'Marked as featured.' : 'Removed from featured.' });
      router.refresh();
    } else {
      setFeedback({ kind: 'err', text: r.error ?? 'Feature toggle failed.' });
    }
    setBusyId(null);
  };

  const updateFields = async (row: GalleryAdminItem, fields: {
    caption?: string;
    vehicleLabel?: string | null;
    serviceLabel?: string | null;
    transformationPhase?: string | null;
    watermark?: boolean;
  }) => {
    setBusyId(row.id);
    setFeedback(null);
    const r = await galleryMutate({
      op: 'updateFields',
      id: row.id,
      ...fields
    });
    if (r.ok) {
      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...fields } : x)));
      setFeedback({ kind: 'ok', text: 'Image fields updated.' });
      router.refresh();
    } else {
      setFeedback({ kind: 'err', text: r.error ?? 'Update failed.' });
    }
    setBusyId(null);
  };

  const remove = async (row: GalleryAdminItem) => {
    if (!confirm('Remove this gallery image from the CMS?')) return;
    setBusyId(row.id);
    setFeedback(null);
    const r = await galleryMutate({ op: 'delete', id: row.id });
    if (r.ok) {
      setItems((prev) => prev.filter((x) => x.id !== row.id));
      setFeedback({ kind: 'ok', text: 'Image removed.' });
      router.refresh();
    } else {
      setFeedback({ kind: 'err', text: r.error ?? 'Delete failed.' });
    }
    setBusyId(null);
  };

  // Apply Filters for Manage Tab
  const filteredItems = items.filter((item) => {
    const searchLower = searchTerm.toLowerCase();
    const captionMatch = (item.caption || '').toLowerCase().includes(searchLower);
    const vehicleMatch = (item.vehicleLabel || '').toLowerCase().includes(searchLower);
    const serviceMatch = (item.serviceLabel || '').toLowerCase().includes(searchLower);
    if (searchTerm && !captionMatch && !vehicleMatch && !serviceMatch) return false;

    if (phaseFilter !== 'all') {
      const itemPhase = item.transformationPhase || '';
      if (phaseFilter === 'before' && itemPhase !== 'before') return false;
      if (phaseFilter === 'after' && itemPhase !== 'after') return false;
      if (phaseFilter === 'before_after' && itemPhase !== 'before_after') return false;
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'draft' && item.published) return false;
      if (statusFilter === 'published' && !item.published) return false;
      if (statusFilter === 'featured' && !item.featured) return false;
    }

    return true;
  });

  return (
    <div className='mt-6 space-y-6'>
      {/* Premium Tab Selector */}
      <div className="flex gap-2 border-b border-white/5 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('manage')}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition duration-200 ${
            activeTab === 'manage'
              ? 'border border-gold bg-gold/10 text-gold-soft'
              : 'border border-transparent text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Manage & Sort Gallery
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('wizard');
            setWizardStep('select');
          }}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition duration-200 flex items-center gap-1.5 ${
            activeTab === 'wizard'
              ? 'border border-gold bg-gold/10 text-gold-soft'
              : 'border border-transparent text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse"></span>
          Before/After Publisher Wizard
        </button>
      </div>

      {/* ======================================================== */}
      {/* 1. MANAGEMENT TAB                                        */}
      {/* ======================================================== */}
      {activeTab === 'manage' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-black/40 border border-white/10 rounded-xl p-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">Search Gallery</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-gold"
                placeholder="Search title, vehicle, service..."
              />
            </div>
            
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">Phase Filter</label>
              <select
                value={phaseFilter}
                onChange={(e) => setPhaseFilter(e.target.value)}
                className="w-full rounded border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-gold"
              >
                <option value="all">All Phases</option>
                <option value="before">Before</option>
                <option value="after">After</option>
                <option value="before_after">Before / After Pair</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">Status Filter</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-gold"
              >
                <option value="all">All Statuses</option>
                <option value="published">Published</option>
                <option value="draft">Draft / Offline</option>
                <option value="featured">Featured Transformations</option>
              </select>
            </div>
          </div>

          <p className='text-xs text-zinc-500'>Drag thumbnails to reorder, then save. Featured items sort first on the public gallery.</p>
          
          {filteredItems.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">No gallery images match active filters.</p>
          ) : (
            <div className="max-h-[min(80vh,70rem)] overflow-y-auto rounded-xl border border-white/10 bg-black/20 py-2 pl-2 pr-1">
              <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                {filteredItems.map((row) => {
                  const src = safeImageUrl({ url: row.url, image_url: row.url });
                  const pending = busyId === row.id;
                  return (
                    <li
                      key={row.id}
                      draggable
                      onDragStart={() => setDragId(row.id)}
                      onDragOver={(e) => onDragOver(e, row.id)}
                      onDragEnd={() => setDragId(null)}
                      className={`cursor-grab overflow-hidden rounded-xl border bg-black/50 active:cursor-grabbing ${
                        dragId === row.id ? 'border-gold shadow-[0_0_12px_rgba(212,175,55,0.2)]' : 'border-white/10'
                      }`}
                    >
                      <div className='relative aspect-[4/3] w-full bg-zinc-900'>
                        <Image src={src} alt={row.caption ?? 'Gallery'} fill className='object-cover' sizes='(max-width:768px) 50vw, 33vw' unoptimized />
                      </div>
                      <div className='space-y-2.5 p-3.5 text-left'>
                        <label className='block text-[9px] font-black uppercase text-zinc-500'>
                          Public Title / Caption
                          <input
                            key={`${row.id}-caption`}
                            defaultValue={row.caption ?? ''}
                            disabled={pending}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (row.caption ?? '').trim()) void updateFields(row, { caption: v });
                            }}
                            className='mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white'
                            placeholder='Before — SUV interior'
                          />
                        </label>

                        <label className='block text-[9px] font-black uppercase text-zinc-500'>
                          Vehicle Label
                          <input
                            key={`${row.id}-vehicle`}
                            defaultValue={row.vehicleLabel ?? ''}
                            disabled={pending}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (row.vehicleLabel ?? '').trim()) void updateFields(row, { vehicleLabel: v || null });
                            }}
                            className='mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white'
                            placeholder='e.g. Tesla Model S'
                          />
                        </label>

                        <label className='block text-[9px] font-black uppercase text-zinc-500'>
                          Service Label
                          <input
                            key={`${row.id}-service`}
                            defaultValue={row.serviceLabel ?? ''}
                            disabled={pending}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (row.serviceLabel ?? '').trim()) void updateFields(row, { serviceLabel: v || null });
                            }}
                            className='mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white'
                            placeholder='e.g. Paint Correction'
                          />
                        </label>

                        <div className="grid grid-cols-2 gap-2">
                          <label className='block text-[9px] font-black uppercase text-zinc-500'>
                            Phase
                            <select
                              key={`${row.id}-phase`}
                              defaultValue={row.transformationPhase ?? ''}
                              disabled={pending}
                              onChange={(e) => {
                                const v = e.target.value || null;
                                void updateFields(row, { transformationPhase: v });
                              }}
                              className='mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white'
                            >
                              <option value="">None</option>
                              <option value="before">Before</option>
                              <option value="after">After</option>
                              <option value="before_after">Before/After Pair</option>
                            </select>
                          </label>

                          <label className="flex flex-col justify-end text-[9px] font-black uppercase text-zinc-500 cursor-pointer">
                            <span className="mb-2.5">Watermark</span>
                            <div className="flex items-center h-8">
                              <input
                                type="checkbox"
                                defaultChecked={row.watermark}
                                onChange={(e) => {
                                  void updateFields(row, { watermark: e.target.checked });
                                }}
                                className="h-4 w-4 rounded border-white/10 text-gold focus:ring-0"
                              />
                            </div>
                          </label>
                        </div>

                        <div className='flex flex-wrap gap-1 pt-1.5 border-t border-white/5'>
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${row.published ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700 text-zinc-400'}`}>
                            {row.published ? 'Published' : 'Draft'}
                          </span>
                          {row.featured ? (
                            <span className='rounded bg-gold/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gold-soft'>Featured</span>
                          ) : null}
                          {row.watermark ? (
                            <span className='rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-blue-300'>Watermarked</span>
                          ) : null}
                        </div>

                        <div className='flex flex-wrap gap-1 pt-1'>
                          <button
                            type='button'
                            disabled={pending}
                            onClick={() => void togglePublished(row)}
                            className='rounded border border-gold/40 px-2 py-1 text-[10px] font-bold uppercase text-gold-soft disabled:opacity-40 hover:bg-gold/10'
                          >
                            {row.published ? 'Unpublish' : 'Publish'}
                          </button>
                          <button
                            type='button'
                            disabled={pending}
                            onClick={() => void toggleFeatured(row)}
                            className='rounded border border-white/20 px-2 py-1 text-[10px] font-bold uppercase text-zinc-200 disabled:opacity-40 hover:bg-white/5'
                          >
                            {row.featured ? 'Unfeature' : 'Feature'}
                          </button>
                          <button
                            type='button'
                            disabled={pending}
                            onClick={() => void remove(row)}
                            className='rounded border border-red-500/40 px-2 py-1 text-[10px] font-bold uppercase text-red-300 disabled:opacity-40 hover:bg-red-500/10'
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          
          <button
            type='button'
            disabled={saving}
            onClick={() => void saveOrder()}
            className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40 hover:bg-gold-soft transition'
          >
            {saving ? 'Saving…' : 'Save gallery order'}
          </button>
          {feedback ? (
            <p
              role={feedback.kind === 'err' ? 'alert' : 'status'}
              className={`text-sm font-medium ${feedback.kind === 'err' ? 'text-rose-300' : 'text-emerald-300'}`}
            >
              {feedback.text}
            </p>
          ) : null}
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. PUBLISHER WIZARD TAB                                  */}
      {/* ======================================================== */}
      {activeTab === 'wizard' && (
        <div className="gb-glass bg-zinc-950/20 border border-gold/10 rounded-2xl p-6 space-y-6">
          {/* Progress Tracker Headers */}
          <div className="flex justify-between items-center max-w-lg mx-auto">
            {[
              { key: 'select', label: '1. Select Photos' },
              { key: 'preview', label: '2. Compare Slider' },
              { key: 'configure', label: '3. Metadata' },
              { key: 'publish', label: '4. Target & Save' },
            ].map((step) => {
              const stepsOrder = ['select', 'preview', 'configure', 'publish'];
              const currentIdx = stepsOrder.indexOf(wizardStep);
              const stepIdx = stepsOrder.indexOf(step.key as any);
              const isActive = wizardStep === step.key;
              const isPassed = currentIdx > stepIdx;

              return (
                <div key={step.key} className="flex items-center flex-1 last:flex-none">
                  <span className={`text-[10px] font-black uppercase tracking-wider transition ${
                    isActive ? 'text-gold font-extrabold' : isPassed ? 'text-emerald-400' : 'text-zinc-500'
                  }`}>
                    {step.label}
                  </span>
                  {step.key !== 'publish' && (
                    <div className={`h-[1px] flex-1 mx-4 border-t ${
                      isPassed ? 'border-emerald-500/50' : 'border-white/5'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Step 1: Select Photos */}
          {wizardStep === 'select' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Select Job Photos</h3>
                  <p className="text-xs text-zinc-400 mt-1">Select a technician work order and pick the Before and After shots.</p>
                </div>
                <input
                  type="text"
                  placeholder="Filter jobs..."
                  value={wizardSearch}
                  onChange={(e) => setWizardSearch(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-white focus:outline-none focus:border-gold w-64"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Work Order Lists */}
                <div className="lg:col-span-1 max-h-[350px] overflow-y-auto space-y-2 border border-white/5 rounded-xl bg-black/40 p-2">
                  {groupedJobs.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic p-4">No recent photos found.</p>
                  ) : (
                    groupedJobs.map((job) => {
                      const isSelected = selectedGroupKey === job.groupKey;
                      return (
                        <button
                          key={job.groupKey}
                          type="button"
                          onClick={() => handleJobSelect(job)}
                          className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between ${
                            isSelected
                              ? 'border-gold bg-gold/5 text-gold-soft'
                              : 'border-white/5 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-900/70'
                          }`}
                        >
                          <div>
                            <p className="text-xs font-bold truncate max-w-[150px]">{job.vehicleLabel}</p>
                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">{job.customerName}</p>
                          </div>
                          <span className="text-[10px] font-mono bg-black/40 px-1.5 py-0.5 rounded border border-white/5 text-zinc-400 shrink-0">
                            {job.photos.length} photos
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Photo Selection Grid */}
                <div className="lg:col-span-2 border border-white/5 rounded-xl bg-black/20 p-4 min-h-[300px] flex flex-col justify-between">
                  {!selectedJobId ? (
                    <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs italic">
                      Choose a work order from the list on the left to display photos.
                    </div>
                  ) : (
                    <div className="space-y-6 flex-1">
                      {/* Before Photos */}
                      <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-amber-200">1. Select Before Image</p>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {groupedJobs.find((j) => j.groupKey === selectedGroupKey)?.photos.map((p) => {
                            const isBefore = selectedBeforeUrl === p.url;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => setSelectedBeforeUrl(p.url)}
                                className={`relative h-20 w-20 shrink-0 rounded-xl overflow-hidden border-2 transition ${
                                  isBefore ? 'border-gold shadow-[0_0_12px_rgba(212,175,55,0.4)]' : 'border-white/5 opacity-70 hover:opacity-100'
                                }`}
                              >
                                <img src={p.url} className="h-full w-full object-cover" alt="Before Option" />
                                <span className="absolute bottom-1 right-1 bg-black/60 px-1 text-[8px] font-bold uppercase rounded text-zinc-400">
                                  {p.category}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* After Photos */}
                      <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">2. Select After Image</p>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {groupedJobs.find((j) => j.groupKey === selectedGroupKey)?.photos.map((p) => {
                            const isAfter = selectedAfterUrl === p.url;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => setSelectedAfterUrl(p.url)}
                                className={`relative h-20 w-20 shrink-0 rounded-xl overflow-hidden border-2 transition ${
                                  isAfter ? 'border-gold shadow-[0_0_12px_rgba(212,175,55,0.4)]' : 'border-white/5 opacity-70 hover:opacity-100'
                                }`}
                              >
                                <img src={p.url} className="h-full w-full object-cover" alt="After Option" />
                                <span className="absolute bottom-1 right-1 bg-black/60 px-1 text-[8px] font-bold uppercase rounded text-zinc-400">
                                  {p.category}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions footer */}
                  <div className="flex justify-end pt-4 border-t border-white/5 mt-4">
                    <button
                      type="button"
                      disabled={!selectedBeforeUrl || !selectedAfterUrl}
                      onClick={() => setWizardStep('preview')}
                      className="rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black hover:bg-gold-soft transition disabled:opacity-40"
                    >
                      Compare Slider →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Compare Slider */}
          {wizardStep === 'preview' && selectedBeforeUrl && selectedAfterUrl && (
            <div className="space-y-6 text-center">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Interactive Comparison</h3>
                <p className="text-xs text-zinc-400 mt-1">Slide to compare selected transformation frames.</p>
              </div>

              {/* Slider Component */}
              <div className="relative aspect-[4/3] w-full max-w-xl mx-auto overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
                {/* Before Photo */}
                <img src={selectedBeforeUrl} className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none" alt="Before" />
                
                {/* After Photo (Clipped) */}
                <div 
                  className="absolute inset-y-0 left-0 h-full overflow-hidden select-none pointer-events-none" 
                  style={{ width: `${sliderVal}%` }}
                >
                  <img src={selectedAfterUrl} className="absolute inset-y-0 left-0 h-full object-cover select-none pointer-events-none" style={{ width: '100%', minWidth: '576px', maxWidth: '576px' }} alt="After" />
                </div>
                
                {/* Slit vertical bar & drag handle */}
                <div 
                  className="absolute inset-y-0 w-[2px] bg-gold pointer-events-none shadow-[0_0_8px_rgba(212,175,55,0.8)]" 
                  style={{ left: `${sliderVal}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-9 w-9 rounded-full border border-gold bg-black flex items-center justify-center shadow-[0_0_15px_rgba(212,175,55,0.4)]">
                    <span className="text-gold text-xs font-black select-none">↔</span>
                  </div>
                </div>
                
                {/* Real range input for mouse control */}
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={sliderVal} 
                  onChange={(e) => setSliderVal(Number(e.target.value))} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20"
                />

                <span className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[8px] font-black uppercase text-amber-200 tracking-wider">Before</span>
                <span className="absolute bottom-2 right-2 bg-black/60 px-2 py-0.5 rounded text-[8px] font-black uppercase text-emerald-300 tracking-wider">After</span>
              </div>

              <div className="flex justify-between items-center max-w-xl mx-auto pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setWizardStep('select')}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black uppercase text-zinc-400 hover:text-white transition"
                >
                  ← Change Photos
                </button>
                <button
                  type="button"
                  onClick={() => setWizardStep('configure')}
                  className="rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black hover:bg-gold-soft transition"
                >
                  Configure Details →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Configure Details */}
          {wizardStep === 'configure' && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Details & Metadata</h3>
                <p className="text-xs text-zinc-400 mt-1">Configure user-facing labels and tags for filtering.</p>
              </div>

              <div className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-400 mb-1">
                    Public Caption / Title
                  </label>
                  <input
                    type="text"
                    value={wTitle}
                    onChange={(e) => setWTitle(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-gold"
                    placeholder="e.g. BMW M4 Competition · Paint Correction"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-400 mb-1">
                      Vehicle Label
                    </label>
                    <input
                      type="text"
                      value={wVehicleLabel}
                      onChange={(e) => setWVehicleLabel(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-gold"
                      placeholder="e.g. BMW M4"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-400 mb-1">
                      Service Label
                    </label>
                    <input
                      type="text"
                      value={wServiceLabel}
                      onChange={(e) => setWServiceLabel(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-gold"
                      placeholder="e.g. Stage 2 Polish"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-400 mb-1">
                      Vehicle Type
                    </label>
                    <select
                      value={wVehicleType}
                      onChange={(e) => setWVehicleType(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black p-3 text-sm text-white focus:outline-none focus:border-gold"
                    >
                      {['sedan', 'SUV', 'truck', 'coupe', 'van', 'other'].map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-400 mb-1">
                      Service Category
                    </label>
                    <select
                      value={wServiceCategory}
                      onChange={(e) => setWServiceCategory(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black p-3 text-sm text-white focus:outline-none focus:border-gold"
                    >
                      {['exterior', 'interior', 'full detail', 'ceramic coating'].map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-400 mb-1">
                    Tags (Comma Separated)
                  </label>
                  <input
                    type="text"
                    value={wTags}
                    onChange={(e) => setWTags(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-gold"
                    placeholder="ceramic coating, paint correction, interior, SUV"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-white/5 mt-6">
                <button
                  type="button"
                  onClick={() => setWizardStep('preview')}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black uppercase text-zinc-400 hover:text-white transition"
                >
                  ← Back to Preview
                </button>
                <button
                  type="button"
                  disabled={!wTitle.trim()}
                  onClick={() => setWizardStep('publish')}
                  className="rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black hover:bg-gold-soft transition disabled:opacity-40"
                >
                  Publish Destinations →
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Publish & Options */}
          {wizardStep === 'publish' && (
            <div className="space-y-6 max-w-xl mx-auto">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Finalize & Publish</h3>
                <p className="text-xs text-zinc-400 mt-1">Configure target publishing options and complete.</p>
              </div>

              {publishFeedback && (
                <div className={`p-4 rounded-xl border text-left text-xs ${
                  publishFeedback.kind === 'err' ? 'border-red-500/40 bg-red-500/10 text-red-100' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                }`}>
                  {publishFeedback.text}
                </div>
              )}

              {/* Summary Card */}
              <div className="bg-black/50 border border-white/10 rounded-2xl p-4 text-left grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Transformation Summary</p>
                  <div>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase block">Title</span>
                    <span className="text-xs text-white font-bold">{wTitle}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase block">Vehicle / Service Type</span>
                    <span className="text-xs text-white">{wVehicleLabel} · {wServiceLabel}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase block">Tags</span>
                    <span className="text-xs text-white">{wTags || 'None'}</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Publish Options</p>
                  
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wPublishImmediately}
                      onChange={(e) => setWPublishImmediately(e.target.checked)}
                      className="h-4 w-4 rounded border-white/10 text-gold focus:ring-0"
                    />
                    <span>Publish Immediately</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wAddToFeatured}
                      onChange={(e) => setWAddToFeatured(e.target.checked)}
                      className="h-4 w-4 rounded border-white/10 text-gold focus:ring-0"
                    />
                    <span>Add to Homepage Featured Showcase</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wWatermark}
                      onChange={(e) => setWWatermark(e.target.checked)}
                      className="h-4 w-4 rounded border-white/10 text-gold focus:ring-0"
                    />
                    <span>Add CSS Watermark</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-white/5">
                <button
                  type="button"
                  disabled={publishing}
                  onClick={() => setWizardStep('configure')}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black uppercase text-zinc-400 hover:text-white transition disabled:opacity-40"
                >
                  ← Edit Details
                </button>
                <button
                  type="button"
                  disabled={publishing}
                  onClick={handlePublishTransformation}
                  className="rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black hover:bg-gold-soft transition disabled:opacity-40 shadow-[0_0_15px_rgba(212,175,55,0.3)]"
                >
                  {publishing ? 'Publishing...' : 'Publish Transformation'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

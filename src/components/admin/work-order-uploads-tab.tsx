'use client';

import { useMemo, useState } from 'react';

type Photo = {
  id: string;
  table?: string;
  url: string;
  category: string;
  phase?: string;
  photo_type?: string;
  created_at: string;
  uploader?: string;
  appointment_id?: string | null;
  fallback_booking_id?: string | null;
  vehicle_label?: string | null;
  vehicle_index?: number | null;
  customer_name?: string | null;
  customer_email?: string | null;
  vehicle_description?: string | null;
  vehicle_color?: string | null;
  service_type?: string | null;
};

const PHOTO_CATEGORIES = ['before', 'after', 'interior', 'exterior', 'damage', 'wheels', 'product', 'process', 'misc'] as const;
const PHOTO_TYPE_OPTIONS = ['before', 'after', 'interior', 'exterior', 'damage', 'wheels', 'product', 'process', 'front', 'rear', 'driver_side', 'passenger_side', 'roof', 'existing_damage', 'other'];

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function normalizeCategory(raw: unknown) {
  const c = str(raw).toLowerCase().replace(/\s+/g, '_');
  if (c.includes('after') || c.includes('complete') || c.includes('finish')) return 'after';
  if (c.includes('damage') || c.includes('scratch') || c.includes('dent')) return 'damage';
  if (c.includes('product')) return 'product';
  if (c.includes('process')) return 'process';
  if (c.includes('wheel') || c.includes('tire') || c.includes('rim')) return 'wheels';
  if (c.includes('interior') || c.includes('seat') || c.includes('dash')) return 'interior';
  if (c.includes('exterior') || c.includes('front') || c.includes('rear') || c.includes('driver') || c.includes('passenger') || c.includes('roof')) return 'exterior';
  if (c.includes('before') || c.includes('pre')) return 'before';
  return 'misc';
}

function isBeforeCandidate(photo: Photo) {
  if (str(photo.phase).toLowerCase() === 'before') return true;
  const c = normalizeCategory(photo.category);
  return c === 'before' || c === 'exterior' || c === 'damage' || c === 'wheels';
}

function isAfterCandidate(photo: Photo) {
  if (str(photo.phase).toLowerCase() === 'after') return true;
  return normalizeCategory(photo.category) === 'after';
}

function diagnostics(input: Photo[], filtered: Photo[]) {
  const missingUrl = input.filter((p) => !p.url).length;
  const missingJob = input.filter((p) => !p.appointment_id && !p.fallback_booking_id).length;
  const missingVehicle = input.filter((p) => p.vehicle_index == null && !p.vehicle_label).length;
  const filteredOut = Math.max(0, input.length - filtered.length);
  if (input.length === 0) return ['No media rows were loaded from job_media or job_photos.'];
  return [
    missingUrl ? `${missingUrl} row(s) are missing URL or storage path.` : '',
    missingJob ? `${missingJob} row(s) are missing appointment_id, work_order_id, or fallback_booking_id.` : '',
    missingVehicle ? `${missingVehicle} row(s) are missing vehicle_index or vehicle_label.` : '',
    filteredOut ? `${filteredOut} row(s) were filtered out by the current search/service filters.` : '',
  ].filter(Boolean);
}

export function WorkOrderUploadsTab({ recentPhotos }: { recentPhotos: unknown[] }) {
  const rawPhotos = (recentPhotos || []) as Photo[];
  const [query, setQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const [selectedBeforePhoto, setSelectedBeforePhoto] = useState<string | null>(null);
  const [selectedAfterPhoto, setSelectedAfterPhoto] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState('');
  const [postCaption, setPostCaption] = useState('');
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [serviceLabel, setServiceLabel] = useState('Premium Detail');
  const [vehicleType, setVehicleType] = useState('all');
  const [serviceCategory, setServiceCategory] = useState('all');
  const [destination, setDestination] = useState('gallery');
  const [tags, setTags] = useState('');
  const [useWatermark, setUseWatermark] = useState(true);
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [creatingPost, setCreatingPost] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);
  const [photoOverrides, setPhotoOverrides] = useState<Record<string, { phase?: string; type?: string }>>({});
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);

  const filteredPhotos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rawPhotos.filter((p) => {
      if (!p.url) return false;
      const service = str(p.service_type).toLowerCase();
      if (serviceFilter !== 'all' && !service.includes(serviceFilter)) return false;
      if (!q) return true;
      return [
        p.category,
        p.vehicle_label,
        p.vehicle_description,
        p.vehicle_color,
        p.customer_name,
        p.customer_email,
        p.service_type,
        p.uploader,
        p.created_at,
      ].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [query, rawPhotos, serviceFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, { groupKey: string; jobId: string; vehicleLabel: string; customer: string; service: string; photos: Photo[] }>();
    for (const p of filteredPhotos) {
      const jobId = p.appointment_id || p.fallback_booking_id || 'orphan';
      const label = p.vehicle_label || p.vehicle_description || `Vehicle ${Number(p.vehicle_index ?? 0) + 1}`;
      const token = p.vehicle_index != null ? `vehicle-${p.vehicle_index}` : label;
      const groupKey = `${jobId}-${token}`;
      const row = map.get(groupKey) ?? {
        groupKey,
        jobId,
        vehicleLabel: label,
        customer: p.customer_name || p.customer_email || 'Customer',
        service: p.service_type || 'Mobile detail',
        photos: [],
      };
      row.photos.push(p);
      map.set(groupKey, row);
    }
    return Array.from(map.values());
  }, [filteredPhotos]);

  const activeGroup = groups.find((g) => g.groupKey === activeGroupKey) ?? null;

  async function updatePhotoType(photo: Photo, phase: string, photoType: string) {
    setBusyPhotoId(photo.id);
    setPostError(null);
    try {
      const response = await fetch('/api/admin/work-order-photo-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: photo.id,
          table: photo.table || 'job_media',
          phase,
          photoType,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setPostError(data.error || 'Photo type update failed.');
        return;
      }
      setPhotoOverrides((prev) => ({ ...prev, [photo.id]: { phase, type: photoType } }));
    } catch (e) {
      setPostError(e instanceof Error ? e.message : 'Photo type update failed.');
    } finally {
      setBusyPhotoId(null);
    }
  }

  function displayPhase(photo: Photo) {
    return photoOverrides[photo.id]?.phase || photo.phase || (normalizeCategory(photo.category) === 'after' ? 'after' : 'before');
  }

  function displayType(photo: Photo) {
    return photoOverrides[photo.id]?.type || photo.photo_type || photo.category || 'other';
  }

  function openPublisher(group: NonNullable<typeof activeGroup>) {
    const before = group.photos.filter(isBeforeCandidate);
    const after = group.photos.filter(isAfterCandidate);
    setActiveGroupKey(group.groupKey);
    setVehicleLabel(group.vehicleLabel);
    setServiceLabel(group.service);
    setPostTitle(`${group.vehicleLabel} Transformation`);
    setPostCaption(`${group.vehicleLabel} detailed by Gloss Boss ATX.`);
    setSelectedBeforePhoto(before[0]?.url || group.photos[0]?.url || null);
    setSelectedAfterPhoto(after[0]?.url || group.photos[1]?.url || null);
    setPostError(null);
    setPostSuccess(null);
  }

  async function createPost() {
    if (!activeGroup || !selectedBeforePhoto || !selectedAfterPhoto || !postTitle.trim()) return;
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
          vehicleClass: vehicleType,
          serviceCategory,
          destination,
          tags,
          caption: postTitle,
          publicCaption: postCaption,
          watermark: useWatermark,
          published: publishImmediately,
          jobId: activeGroup.jobId === 'orphan' ? undefined : activeGroup.jobId,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) setPostError(data.error || 'Failed to publish transformation.');
      else {
        setPostSuccess('Transformation published. Homepage/gallery will refresh with real data.');
        window.setTimeout(() => setActiveGroupKey(null), 1300);
      }
    } catch (e) {
      setPostError(e instanceof Error ? e.message : 'Failed to publish transformation.');
    } finally {
      setCreatingPost(false);
    }
  }

  return (
    <div className='space-y-6'>
      <section className='gb-premium-card rounded-3xl border border-gold/15 bg-zinc-950/80 p-6'>
        <p className='text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Work order photos</p>
        <h2 className='mt-2 text-2xl font-black uppercase text-white'>Gallery Review Queue</h2>
        <p className='mt-2 max-w-3xl text-sm text-zinc-400'>
          Review real technician uploads, group them by vehicle, create before/after pairs, and publish directly to Gallery, Homepage Featured, Services Page, or all destinations.
        </p>
        <div className='mt-5 grid gap-3 md:grid-cols-[1fr_220px]'>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search customer, email, vehicle, color, service, date, technician...'
            className='rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition focus:border-gold/50'
          />
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className='rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white'>
            <option value='all'>All services</option>
            <option value='exterior'>Exterior</option>
            <option value='interior'>Interior</option>
            <option value='full'>Full detail</option>
            <option value='ceramic'>Ceramic coating</option>
          </select>
        </div>
      </section>

      {groups.length === 0 ? (
        <section className='rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5'>
          <p className='text-sm font-black uppercase text-amber-100'>No publishable work-order photos found</p>
          <ul className='mt-3 space-y-1 text-xs text-amber-50/80'>
            {(diagnostics(rawPhotos, filteredPhotos).length ? diagnostics(rawPhotos, filteredPhotos) : ['Media rows exist, but no rows match the active filters.']).map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className='grid gap-5'>
        {groups.map((group) => {
          const beforeCount = group.photos.filter(isBeforeCandidate).length;
          const afterCount = group.photos.filter(isAfterCandidate).length;
          return (
            <article key={group.groupKey} className='rounded-3xl border border-gold/15 bg-black/50 p-5 shadow-[0_0_30px_rgba(212,166,77,0.06)]'>
              <div className='flex flex-wrap items-start justify-between gap-4'>
                <div>
                  <p className='text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>{group.customer}</p>
                  <h3 className='mt-1 text-lg font-black uppercase text-white'>{group.vehicleLabel}</h3>
                  <p className='mt-1 text-xs text-zinc-500'>{group.service} - job {group.jobId.slice(0, 8).toUpperCase()}</p>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <a href={`/admin/work-orders/${group.jobId}`} className='rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-300 hover:border-gold/40 hover:text-gold-soft'>
                    View Photos
                  </a>
                  <button
                    type='button'
                    onClick={() => openPublisher(group)}
                    disabled={group.photos.length < 2}
                    className='rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black transition hover:bg-gold-soft disabled:opacity-40'
                  >
                    Create Before/After
                  </button>
                </div>
              </div>

              <div className='mt-4 grid gap-3 sm:grid-cols-4'>
                <Metric label='Total photos' value={group.photos.length} />
                <Metric label='Before candidates' value={beforeCount} tone='amber' />
                <Metric label='After candidates' value={afterCount} tone='green' />
                <Metric label='Publish ready' value={beforeCount > 0 && afterCount > 0 ? 'Yes' : 'Needs pair'} tone={beforeCount > 0 && afterCount > 0 ? 'green' : 'amber'} />
              </div>

              <div className='mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
                {PHOTO_CATEGORIES.map((category) => {
                  const categoryPhotos = group.photos.filter((p) => {
                    const phase = displayPhase(p);
                    if (category === 'before' || category === 'after') return phase === category;
                    return normalizeCategory(displayType(p)) === category;
                  });
                  return (
                    <div key={category} className='rounded-2xl border border-white/10 bg-zinc-950/70 p-3'>
                      <p className='text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400'>{category} ({categoryPhotos.length})</p>
                      {categoryPhotos.length === 0 ? (
                        <p className='py-4 text-xs italic text-zinc-600'>No {category} photos.</p>
                      ) : (
                        <div className='mt-2 flex gap-2 overflow-x-auto pb-1'>
                          {categoryPhotos.map((photo) => (
                            <div key={photo.id} className='w-32 shrink-0 rounded-xl border border-white/10 bg-black/70 p-1.5'>
                              <a href={photo.url} target='_blank' rel='noreferrer' className='group relative block h-20 overflow-hidden rounded-lg border border-white/10 hover:border-gold/50'>
                                <img src={photo.url} alt={`${category} photo`} className='h-full w-full object-cover transition group-hover:scale-105' />
                                <span className='absolute bottom-1 left-1 rounded bg-black/75 px-1 text-[8px] uppercase text-zinc-300'>{displayPhase(photo)}</span>
                              </a>
                              <div className='mt-1 grid gap-1'>
                                <select
                                  value={displayPhase(photo)}
                                  disabled={busyPhotoId === photo.id}
                                  onChange={(e) => void updatePhotoType(photo, e.target.value, displayType(photo))}
                                  className='w-full rounded border border-white/10 bg-black px-1 py-1 text-[9px] uppercase text-white'
                                >
                                  <option value='before'>Before</option>
                                  <option value='after'>After</option>
                                </select>
                                <select
                                  value={displayType(photo)}
                                  disabled={busyPhotoId === photo.id}
                                  onChange={(e) => void updatePhotoType(photo, displayPhase(photo), e.target.value)}
                                  className='w-full rounded border border-white/10 bg-black px-1 py-1 text-[9px] uppercase text-white'
                                >
                                  {PHOTO_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
                                </select>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      {activeGroup ? (
        <div className='fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md' onClick={() => setActiveGroupKey(null)}>
          <div className='w-full max-w-4xl overflow-y-auto rounded-3xl border border-gold/30 bg-black/95 p-6 shadow-[0_0_50px_rgba(212,175,55,0.15)] max-h-[92vh]' onClick={(e) => e.stopPropagation()}>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <p className='text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft'>Publish transformation</p>
                <h3 className='mt-1 text-xl font-black uppercase text-white'>{activeGroup.vehicleLabel}</h3>
                <p className='mt-1 text-xs text-zinc-500'>Select before/after frames, preview, then publish.</p>
              </div>
              <button type='button' onClick={() => setActiveGroupKey(null)} className='rounded-xl border border-white/10 px-3 py-2 text-xs font-black uppercase text-zinc-300'>Close</button>
            </div>

            {postError ? <p className='mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100'>{postError}</p> : null}
            {postSuccess ? <p className='mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100'>{postSuccess}</p> : null}

            <div className='mt-5 grid gap-5 lg:grid-cols-[1fr_320px]'>
              <div className='space-y-4'>
                <PhotoSelector label='Select before image' photos={activeGroup.photos.filter(isBeforeCandidate)} selected={selectedBeforePhoto} onSelect={setSelectedBeforePhoto} />
                <PhotoSelector label='Select after image' photos={activeGroup.photos.filter(isAfterCandidate)} selected={selectedAfterPhoto} onSelect={setSelectedAfterPhoto} fallbackPhotos={activeGroup.photos} />
                {selectedBeforePhoto && selectedAfterPhoto ? (
                  <div className='rounded-2xl border border-gold/20 bg-zinc-950/70 p-3'>
                    <p className='mb-2 text-[10px] font-black uppercase tracking-wider text-gold-soft'>Preview before publishing</p>
                    <div className='grid gap-2 sm:grid-cols-2'>
                      <PreviewImage label='Before' url={selectedBeforePhoto} />
                      <PreviewImage label='After' url={selectedAfterPhoto} />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className='space-y-3 rounded-2xl border border-white/10 bg-zinc-950/70 p-4'>
                <TextInput label='Title' value={postTitle} onChange={setPostTitle} placeholder='BMW M4 Paint Correction' />
                <label className='block text-[10px] font-black uppercase tracking-wider text-zinc-400'>
                  Caption
                  <textarea value={postCaption} onChange={(e) => setPostCaption(e.target.value)} rows={3} className='mt-1 w-full rounded-xl border border-white/10 bg-black p-3 text-sm text-white outline-none focus:border-gold/50' />
                </label>
                <TextInput label='Vehicle' value={vehicleLabel} onChange={setVehicleLabel} placeholder='2022 BMW M4' />
                <TextInput label='Service' value={serviceLabel} onChange={setServiceLabel} placeholder='Full detail' />
                <div className='grid gap-2 sm:grid-cols-2'>
                  <SelectInput label='Vehicle type' value={vehicleType} onChange={setVehicleType} options={['all', 'sedan', 'SUV', 'truck', 'coupe', 'van', 'other']} />
                  <SelectInput label='Service category' value={serviceCategory} onChange={setServiceCategory} options={['all', 'exterior', 'interior', 'full detail', 'ceramic coating']} />
                </div>
                <SelectInput label='Destination' value={destination} onChange={setDestination} options={['gallery', 'homepage featured', 'services page', 'all']} />
                <TextInput label='Tags' value={tags} onChange={setTags} placeholder='black paint, wheels, ceramic' />
                <label className='flex items-center gap-2 rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-zinc-300'>
                  <input type='checkbox' checked={useWatermark} onChange={(e) => setUseWatermark(e.target.checked)} className='accent-[var(--gold)]' />
                  Gloss Boss watermark
                </label>
                <label className='flex items-center gap-2 rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-zinc-300'>
                  <input type='checkbox' checked={publishImmediately} onChange={(e) => setPublishImmediately(e.target.checked)} className='accent-[var(--gold)]' />
                  Publish immediately
                </label>
                <button
                  type='button'
                  disabled={creatingPost || !selectedBeforePhoto || !selectedAfterPhoto || !postTitle.trim()}
                  onClick={createPost}
                  className='w-full rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black transition hover:bg-gold-soft disabled:opacity-40'
                >
                  {creatingPost ? 'Publishing...' : destination === 'homepage featured' ? 'Feature on Homepage' : 'Publish'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'amber' | 'green' }) {
  const cls = tone === 'green' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : tone === 'amber' ? 'border-amber-500/20 bg-amber-500/10 text-amber-100' : 'border-white/10 bg-zinc-950 text-white';
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <p className='text-[10px] font-black uppercase tracking-wider opacity-70'>{label}</p>
      <p className='mt-1 text-sm font-black'>{value}</p>
    </div>
  );
}

function PhotoSelector({ label, photos, fallbackPhotos = [], selected, onSelect }: { label: string; photos: Photo[]; fallbackPhotos?: Photo[]; selected: string | null; onSelect: (url: string) => void }) {
  const choices = photos.length ? photos : fallbackPhotos;
  return (
    <div>
      <p className='mb-2 text-xs font-black uppercase tracking-wider text-zinc-400'>{label}</p>
      <div className='flex gap-2 overflow-x-auto pb-1'>
        {choices.map((p) => (
          <button
            key={`${label}-${p.id}`}
            type='button'
            onClick={() => onSelect(p.url)}
            className={`relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition ${selected === p.url ? 'border-gold shadow-[0_0_14px_rgba(212,166,77,0.45)]' : 'border-white/10 opacity-75 hover:opacity-100'}`}
          >
            <img src={p.url} alt={label} className='h-full w-full object-cover' />
            <span className='absolute bottom-1 left-1 rounded bg-black/75 px-1 text-[8px] uppercase text-zinc-300'>{p.category}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewImage({ label, url }: { label: string; url: string }) {
  return (
    <div className='overflow-hidden rounded-xl border border-white/10'>
      <img src={url} alt={`${label} preview`} className='aspect-[4/3] w-full object-cover' />
      <p className='bg-black px-2 py-1 text-[10px] font-black uppercase text-gold-soft'>{label}</p>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className='block text-[10px] font-black uppercase tracking-wider text-zinc-400'>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className='mt-1 w-full rounded-xl border border-white/10 bg-black p-3 text-sm text-white outline-none focus:border-gold/50' />
    </label>
  );
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className='block text-[10px] font-black uppercase tracking-wider text-zinc-400'>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className='mt-1 w-full rounded-xl border border-white/10 bg-black p-3 text-sm text-white'>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteManualReviewAction, saveManualReviewAction, type ReviewActionResult } from '@/lib/admin/review-manager-actions';
import { syncGoogleReviewsAction, type GoogleReviewSyncActionResult } from '@/lib/admin/sync-google-reviews-action';

type ReviewRow = {
  id: string;
  customer_name: string;
  rating: number;
  testimonial: string;
  service_label: string;
  vehicle_label: string;
  source: string;
  published: boolean;
  featured: boolean;
  created_at: string;
};

function dateInputValue(value: string) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function GoogleStatus({
  googleConfigured,
  googleReviewUrl,
  googleApiConfigured,
  googlePlaceConfigured,
  onSync,
  syncPending,
  syncResult,
}: {
  googleConfigured: boolean;
  googleReviewUrl: string;
  googleApiConfigured: boolean;
  googlePlaceConfigured: boolean;
  onSync: () => void;
  syncPending: boolean;
  syncResult: GoogleReviewSyncActionResult | null;
}) {
  const canSync = googleApiConfigured;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className={`rounded-2xl border p-4 ${googleConfigured ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/35 bg-amber-500/10'}`}>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Google review link</p>
        <p className="mt-2 break-all text-sm font-bold text-white">{googleConfigured ? googleReviewUrl : 'Not configured'}</p>
        <p className="mt-1 text-xs text-zinc-400">Powers leave-a-review buttons. Sync imports review text onto the homepage.</p>
      </div>
      <div className={`rounded-2xl border p-4 ${canSync ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/35 bg-amber-500/10'}`}>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Google review sync</p>
        <p className="mt-2 text-sm font-bold text-white">{canSync ? 'Ready to import' : 'API key required'}</p>
        {!googleApiConfigured ? (
          <p className="mt-2 text-xs text-amber-100">Add GOOGLE_PLACES_API_KEY in Vercel. GOOGLE_PLACE_ID is optional — we auto-find Gloss Boss ATX.</p>
        ) : !googlePlaceConfigured ? (
          <p className="mt-1 text-xs text-zinc-400">No GOOGLE_PLACE_ID set — sync will search for your business automatically.</p>
        ) : (
          <p className="mt-1 text-xs text-zinc-400">Place ID configured. Up to 5 latest Google reviews import on sync.</p>
        )}
        <button
          type="button"
          disabled={!canSync || syncPending}
          onClick={onSync}
          className="mt-3 rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase tracking-wider text-black disabled:opacity-50"
        >
          {syncPending ? 'Syncing…' : 'Sync Google reviews now'}
        </button>
        {syncResult ? (
          <p className={`mt-2 text-xs ${syncResult.ok ? 'text-emerald-100' : 'text-rose-200'}`} role="status">
            {syncResult.ok ? syncResult.message : syncResult.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ResultBanner({ result }: { result: ReviewActionResult | null }) {
  if (!result) return null;
  return (
    <p className={`rounded-xl border p-3 text-sm ${result.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-rose-500/35 bg-rose-500/10 text-rose-100'}`} role="status">
      {result.ok ? result.message || 'Saved.' : result.error || 'Save failed.'}
    </p>
  );
}

export function CmsReviewsManager({
  rows,
  googleConfigured,
  googleReviewUrl,
  googleApiConfigured,
  googlePlaceConfigured = false,
}: {
  rows: ReviewRow[];
  googleConfigured: boolean;
  googleReviewUrl: string;
  googleApiConfigured: boolean;
  googlePlaceConfigured?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [syncPending, startSyncTransition] = useTransition();
  const [result, setResult] = useState<ReviewActionResult | null>(null);
  const [syncResult, setSyncResult] = useState<GoogleReviewSyncActionResult | null>(null);

  const syncFromGoogle = () => {
    setSyncResult(null);
    startSyncTransition(async () => {
      const res = await syncGoogleReviewsAction();
      setSyncResult(res);
      if (res.ok) router.refresh();
    });
  };

  const submit = (formData: FormData) => {
    setResult(null);
    startTransition(async () => {
      const res = await saveManualReviewAction(formData);
      setResult(res);
      if (res.ok) router.refresh();
    });
  };

  const remove = (formData: FormData) => {
    setResult(null);
    startTransition(async () => {
      const res = await deleteManualReviewAction(formData);
      setResult(res);
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-gold/20 bg-black/45 p-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-gold-soft">Reviews / Testimonials Manager</p>
        <h2 className="mt-2 text-2xl font-black uppercase text-white">Public social proof, owned by CMS</h2>
        <p className="mt-2 text-sm text-zinc-400">Sync from Google or add manual reviews. Only published testimonials appear on the homepage.</p>
      </div>

      <GoogleStatus
        googleConfigured={googleConfigured}
        googleReviewUrl={googleReviewUrl}
        googleApiConfigured={googleApiConfigured}
        googlePlaceConfigured={googlePlaceConfigured}
        onSync={syncFromGoogle}
        syncPending={syncPending}
        syncResult={syncResult}
      />
      <ResultBanner result={result} />

      <form action={submit} className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-white">Add manual review</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input name="customer_name" placeholder="Reviewer name" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:text-sm" />
          <input name="vehicle_label" placeholder="Vehicle / customer context" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:text-sm" />
          <input name="service_label" placeholder="Service, e.g. Full Detail" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:text-sm" />
          <select name="rating" defaultValue="5" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:text-sm">
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}
          </select>
          <textarea name="testimonial" required rows={4} placeholder="Review text" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:col-span-2 md:text-sm" />
          <input name="source" defaultValue="Manual" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:text-sm" />
          <input name="review_date" type="date" defaultValue={dateInputValue('')} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:text-sm" />
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300 md:col-span-2">
            <label className="flex min-h-10 items-center gap-2"><input name="published" type="checkbox" /> Show publicly</label>
            <label className="flex min-h-10 items-center gap-2"><input name="featured" type="checkbox" /> Featured</label>
          </div>
        </div>
        <button disabled={isPending} className="mt-4 rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase tracking-wider text-black disabled:opacity-60">
          {isPending ? 'Saving...' : 'Save review'}
        </button>
      </form>

      <div className="space-y-3">
        {rows.length === 0 ? <p className="rounded-2xl border border-white/10 bg-black/35 p-5 text-sm text-zinc-400">No reviews yet. Click Sync Google reviews above or add one manually.</p> : null}
        {rows.map((row) => (
          <details key={row.id} className="rounded-2xl border border-white/10 bg-black/35 p-4">
            <summary className="cursor-pointer text-sm font-bold text-white">
              {row.customer_name || 'Customer'} - {row.rating} stars - {row.published ? 'Public' : 'Hidden'} {row.featured ? '- Featured' : ''}
            </summary>
            <form action={submit} className="mt-4 grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={row.id} />
              <input name="customer_name" defaultValue={row.customer_name} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:text-sm" />
              <input name="vehicle_label" defaultValue={row.vehicle_label} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:text-sm" />
              <input name="service_label" defaultValue={row.service_label} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:text-sm" />
              <select name="rating" defaultValue={row.rating} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:text-sm">
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}
              </select>
              <textarea name="testimonial" defaultValue={row.testimonial} rows={4} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:col-span-2 md:text-sm" />
              <input name="source" defaultValue={row.source} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:text-sm" />
              <input name="review_date" type="date" defaultValue={dateInputValue(row.created_at)} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:text-sm" />
              <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300 md:col-span-2">
                <label className="flex min-h-10 items-center gap-2"><input name="published" type="checkbox" defaultChecked={row.published} /> Show publicly</label>
                <label className="flex min-h-10 items-center gap-2"><input name="featured" type="checkbox" defaultChecked={row.featured} /> Featured</label>
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <button disabled={isPending} className="rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-60">Update</button>
              </div>
            </form>
            <form action={remove} className="mt-3">
              <input type="hidden" name="id" value={row.id} />
              <button disabled={isPending} className="rounded-xl border border-rose-500/30 px-4 py-2 text-xs font-black uppercase text-rose-200 disabled:opacity-60">Delete review</button>
            </form>
          </details>
        ))}
      </div>
    </div>
  );
}

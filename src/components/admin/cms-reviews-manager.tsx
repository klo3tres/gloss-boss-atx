import { deleteManualReviewAction, saveManualReviewAction } from '@/lib/admin/review-manager-actions';

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

export function CmsReviewsManager({
  rows,
  googleConfigured,
  googleReviewUrl,
  googleApiConfigured,
}: {
  rows: ReviewRow[];
  googleConfigured: boolean;
  googleReviewUrl: string;
  googleApiConfigured: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-gold/20 bg-black/45 p-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-gold-soft">Reviews / Testimonials Manager</p>
        <h2 className="mt-2 text-2xl font-black uppercase text-white">Public social proof, owned by CMS</h2>
        <p className="mt-2 text-sm text-zinc-400">Add customer testimonials manually, choose what appears publicly, and mark the strongest reviews as featured.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className={`rounded-2xl border p-4 ${googleConfigured ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/35 bg-amber-500/10'}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Google review link</p>
          <p className="mt-2 text-sm font-bold text-white">{googleConfigured ? googleReviewUrl : 'Not configured'}</p>
          <p className="mt-1 text-xs text-zinc-400">Used for public Google review CTAs.</p>
        </div>
        <div className={`rounded-2xl border p-4 ${googleApiConfigured ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/35 bg-amber-500/10'}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Google API import</p>
          <p className="mt-2 text-sm font-bold text-white">{googleApiConfigured ? 'Configured' : 'Setup needed'}</p>
          <p className="mt-1 text-xs text-zinc-400">
            {googleApiConfigured
              ? 'Google import can be enabled by the API integration.'
              : 'Add Google Places/API credentials before pulling Google reviews. No fake Google reviews are shown.'}
          </p>
        </div>
      </div>

      <form action={saveManualReviewAction} className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-white">Add manual review</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input name="customer_name" placeholder="Reviewer name" className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white" />
          <input name="vehicle_label" placeholder="Vehicle / customer context" className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white" />
          <input name="service_label" placeholder="Service, e.g. Full Detail" className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white" />
          <select name="rating" defaultValue="5" className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white">
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}
          </select>
          <textarea name="testimonial" required rows={4} placeholder="Review text" className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white md:col-span-2" />
          <input name="source" defaultValue="Manual" className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white" />
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300">
            <label className="flex items-center gap-2"><input name="published" type="checkbox" /> Show publicly</label>
            <label className="flex items-center gap-2"><input name="featured" type="checkbox" /> Featured</label>
          </div>
        </div>
        <button className="mt-4 rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase tracking-wider text-black">Save review</button>
      </form>

      <div className="space-y-3">
        {rows.length === 0 ? <p className="rounded-2xl border border-white/10 bg-black/35 p-5 text-sm text-zinc-400">No reviews yet. Add one manually or connect Google API later.</p> : null}
        {rows.map((row) => (
          <details key={row.id} className="rounded-2xl border border-white/10 bg-black/35 p-4">
            <summary className="cursor-pointer text-sm font-bold text-white">
              {row.customer_name || 'Customer'} · {row.rating} stars · {row.published ? 'Public' : 'Hidden'} {row.featured ? '· Featured' : ''}
            </summary>
            <form action={saveManualReviewAction} className="mt-4 grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={row.id} />
              <input name="customer_name" defaultValue={row.customer_name} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white" />
              <input name="vehicle_label" defaultValue={row.vehicle_label} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white" />
              <input name="service_label" defaultValue={row.service_label} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white" />
              <select name="rating" defaultValue={row.rating} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white">
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}
              </select>
              <textarea name="testimonial" defaultValue={row.testimonial} rows={4} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white md:col-span-2" />
              <input name="source" defaultValue={row.source} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white" />
              <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300">
                <label className="flex items-center gap-2"><input name="published" type="checkbox" defaultChecked={row.published} /> Show publicly</label>
                <label className="flex items-center gap-2"><input name="featured" type="checkbox" defaultChecked={row.featured} /> Featured</label>
              </div>
              <div className="flex gap-2 md:col-span-2">
                <button className="rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black">Update</button>
              </div>
            </form>
            <form action={deleteManualReviewAction} className="mt-3">
              <input type="hidden" name="id" value={row.id} />
              <button className="rounded-xl border border-rose-500/30 px-4 py-2 text-xs font-black uppercase text-rose-200">Delete review</button>
            </form>
          </details>
        ))}
      </div>
    </div>
  );
}

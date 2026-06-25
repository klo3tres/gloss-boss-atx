'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createManualReviewAction, toggleReviewPublishedAction } from '@/lib/admin/reviews-actions';
import { syncGoogleReviewsAction } from '@/lib/admin/sync-google-reviews-action';

type Review = {
  id: string;
  customer_name: string | null;
  rating: number;
  testimonial: string;
  published: boolean;
  source: string | null;
  created_at: string;
};

export function ReviewsManagerClient({ reviews }: { reviews: Review[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [source, setSource] = useState('Google');

  const syncGoogle = () => {
    setSyncMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await syncGoogleReviewsAction();
      if (res.ok) {
        setSyncMsg(res.message ?? 'Google reviews synced.');
        router.refresh();
      } else {
        setErr(res.error ?? 'Google sync failed.');
      }
    });
  };

  const submit = () => {
    setErr(null);
    startTransition(async () => {
      const res = await createManualReviewAction({
        customerName: name,
        rating,
        testimonial: text,
        source,
        published: true,
      });
      if (res.error) setErr(res.error);
      else {
        setName('');
        setText('');
      }
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-emerald-500/25 bg-emerald-500/5 p-6">
        <h2 className="text-lg font-black text-white">Import from Google</h2>
        <p className="mt-1 text-xs text-zinc-400">Pulls your latest Google Business reviews onto the homepage. Requires GOOGLE_PLACES_API_KEY in Vercel.</p>
        <button type="button" disabled={pending} onClick={syncGoogle} className="mt-4 rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-40">
          {pending ? 'Syncing…' : 'Sync Google reviews'}
        </button>
        {syncMsg ? <p className="mt-2 text-xs text-emerald-200">{syncMsg}</p> : null}
      </section>

      <section className="rounded-3xl border border-gold/20 bg-black/45 p-6">
        <h2 className="text-lg font-black text-white">Add review manually</h2>
        <p className="mt-1 text-xs text-zinc-500">Published reviews appear on the homepage. Use for reviews you want to curate by hand.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white" placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white" placeholder="Source (Google, Manual…)" value={source} onChange={(e) => setSource(e.target.value)} />
          <input type="number" min={1} max={5} className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white" value={rating} onChange={(e) => setRating(Number(e.target.value))} />
          <textarea className="sm:col-span-2 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white" rows={3} placeholder="Review text" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button type="button" disabled={pending || !name || !text} onClick={submit} className="mt-4 rounded-xl bg-gold/20 px-4 py-2 text-[10px] font-black uppercase text-gold-soft disabled:opacity-40">
          Publish on homepage
        </button>
        {err ? <p className="mt-2 text-xs text-red-300">{err}</p> : null}
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/45 p-6">
        <h2 className="text-lg font-black text-white">All reviews ({reviews.length})</h2>
        <ul className="mt-4 space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/8 px-4 py-3 text-sm">
              <div>
                <p className="font-bold text-white">{r.customer_name} · {'★'.repeat(r.rating)}</p>
                <p className="mt-1 text-xs text-zinc-400">{r.testimonial}</p>
                <p className="mt-1 text-[10px] text-zinc-600">{r.source} · {new Date(r.created_at).toLocaleDateString()}</p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => { await toggleReviewPublishedAction(r.id, !r.published); })}
                className={`rounded-lg px-3 py-1 text-[10px] font-black uppercase ${r.published ? 'bg-emerald-500/20 text-emerald-200' : 'bg-zinc-800 text-zinc-400'}`}
              >
                {r.published ? 'Published' : 'Hidden'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

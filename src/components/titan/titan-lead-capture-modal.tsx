'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, ExternalLink } from 'lucide-react';
import {
  bulkImportLeadsAction,
  captureLeadAction,
} from '@/app/(dashboard)/admin/titan/lead-radar-actions';
import {
  INTENT_LABELS,
  SOURCE_TYPE_LABELS,
} from '@/lib/titan/lead-radar-engine';

const SOURCE_TYPES = Object.entries(SOURCE_TYPE_LABELS);

export type LeadCapturePrefill = {
  sourceType?: string;
  sourceName?: string;
  sourceUrl?: string;
  rawText?: string;
  authorName?: string;
  locationText?: string;
  notes?: string;
  estimatedRevenue?: number;
};

export function TitanLeadCaptureModal({
  open,
  onClose,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: LeadCapturePrefill;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState('facebook_group');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [rawText, setRawText] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [revenue, setRevenue] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setSourceType(prefill?.sourceType ?? 'facebook_group');
    setSourceName(prefill?.sourceName ?? '');
    setSourceUrl(prefill?.sourceUrl ?? '');
    setAuthorName(prefill?.authorName ?? '');
    setRawText(prefill?.rawText ?? '');
    setLocation(prefill?.locationText ?? '');
    setNotes(prefill?.notes ?? '');
    setRevenue(prefill?.estimatedRevenue ? String(prefill.estimatedRevenue) : '');
    setPhone('');
    setEmail('');
  }, [open, prefill]);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await captureLeadAction({
        sourceType,
        sourceName,
        sourceUrl,
        authorName,
        contactName: authorName,
        rawText,
        locationText: location,
        phone,
        email,
        estimatedRevenue: revenue ? Number(revenue) : undefined,
        notes,
      });
      if (res.error) setErr(res.error);
      else {
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/80 p-4 sm:items-center">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-cyan-500/25 bg-zinc-950 p-6 shadow-2xl">
        <h2 className="text-xl font-black text-white">Paste lead / capture post</h2>
        <p className="mt-1 text-xs text-zinc-500">Paste the full Facebook/Nextdoor/Reddit post or comment. Titan classifies intent and suggests a reply.</p>
        <div className="mt-4 grid gap-3">
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white">
            {SOURCE_TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Group / source name" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Source URL (optional)" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Contact name if known" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <textarea required value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Paste post or comment text here…" rows={6} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (Austin, Round Rock, etc.)" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone if visible" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email if visible" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          </div>
          <input value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="Est. revenue ($) optional" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
        </div>
        {err ? <p className="mt-2 text-xs text-rose-300">{err}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={pending || !rawText.trim()} className="rounded-xl bg-cyan-500 px-4 py-3 text-[10px] font-black uppercase text-black disabled:opacity-50">Save & classify</button>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-3 text-[10px] font-black uppercase text-zinc-400">Cancel</button>
        </div>
      </form>
    </div>
  );
}

export function LeadRadarSearchButtons({ platform, query }: { platform: string; query: string }) {
  const [toast, setToast] = useState<string | null>(null);
  const q = encodeURIComponent(query);
  const google = `https://www.google.com/search?q=${q}`;
  const reddit = `https://www.reddit.com/search/?q=${q}`;
  const nextdoor = `https://nextdoor.com/search/?query=${q}`;
  const p = platform.toLowerCase();

  const copyFor = async (label: string) => {
    await navigator.clipboard.writeText(query);
    setToast(`Copied "${query}" — paste into ${label} group search. Focus: Today · Past 7 days · Past 14 days. Still reply if no solid answer.`);
    setTimeout(() => setToast(null), 5000);
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <a href={google} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 px-3 py-1.5 text-[10px] font-black uppercase text-cyan-200">
          <ExternalLink className="h-3 w-3" /> Search Google
        </a>
        {p.includes('reddit') ? (
          <a href={reddit} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 px-3 py-1.5 text-[10px] font-black uppercase text-cyan-200">
            <ExternalLink className="h-3 w-3" /> Search Reddit
          </a>
        ) : (
          <a href={reddit} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300">
            <ExternalLink className="h-3 w-3" /> Reddit
          </a>
        )}
        {p.includes('nextdoor') ? (
          <button type="button" onClick={() => void copyFor('Nextdoor')} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300">
            <Copy className="h-3 w-3" /> Copy for Nextdoor
          </button>
        ) : null}
        {p.includes('facebook') || !p.includes('google') ? (
          <button type="button" onClick={() => void copyFor('Facebook')} className="inline-flex items-center gap-1 rounded-lg border border-gold/30 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft">
            <Copy className="h-3 w-3" /> Copy for Facebook
          </button>
        ) : null}
      </div>
      {toast ? <p className="mt-2 text-[10px] text-emerald-300">{toast}</p> : null}
    </div>
  );
}

'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Copy, ExternalLink, Plus, Radar } from 'lucide-react';
import type { LeadRadarItem, LeadRadarSummary } from '@/lib/titan/lead-radar-engine';
import type { HuntCategory, LeadPlaybook } from '@/lib/titan/lead-radar-hunt';
import { Titan24HourHunt } from '@/components/titan/titan-24-hour-hunt';
import { TitanCompetitorReviewTool } from '@/components/titan/titan-competitor-review-tool';
import { TitanOutreachScriptsPanel } from '@/components/titan/titan-outreach-scripts-panel';
import {
  INTENT_LABELS,
  PLATFORM_SUGGESTIONS,
  SEARCH_SUGGESTIONS,
  SOURCE_TYPE_LABELS,
} from '@/lib/titan/lead-radar-engine';
import { displayMoney } from '@/lib/display-format';
import {
  bulkImportLeadsAction,
  captureLeadAction,
  convertLeadToOpportunityAction,
  markLeadStatusAction,
  runGooglePlacesLeadRadarAction,
  scheduleLeadFollowUpAction,
} from '@/app/(dashboard)/admin/titan/lead-radar-actions';

const SOURCE_TYPES = Object.entries(SOURCE_TYPE_LABELS);

function money(dollars: number) {
  return displayMoney(Math.round(dollars * 100));
}

function CaptureModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState('facebook_group');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorProfileUrl, setAuthorProfileUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [revenue, setRevenue] = useState('');
  const [notes, setNotes] = useState('');

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
        authorProfileUrl,
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 sm:items-center">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-cyan-500/25 bg-zinc-950 p-6">
        <h2 className="text-xl font-black text-white">Capture lead</h2>
        <div className="mt-4 grid gap-3">
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white">
            {SOURCE_TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Source name / group" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Source URL" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Author name" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <input value={authorProfileUrl} onChange={(e) => setAuthorProfileUrl(e.target.value)} placeholder="Author profile URL" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <textarea required value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Paste post or comment text" rows={5} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          </div>
          <input value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="Est. revenue ($) optional" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
        </div>
        {err ? <p className="mt-2 text-xs text-rose-300">{err}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="submit" disabled={pending} className="rounded-xl bg-cyan-500 px-4 py-3 text-[10px] font-black uppercase text-black disabled:opacity-50">Save & classify</button>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-3 text-[10px] font-black uppercase text-zinc-400">Cancel</button>
        </div>
      </form>
    </div>
  );
}

function LeadCard({ item }: { item: LeadRadarItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [customDate, setCustomDate] = useState('');

  const act = (fn: () => Promise<{ ok?: boolean; error?: string; opportunityId?: string }>, success: string) => {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setMsg(res.error);
      else {
        setMsg(success);
        router.refresh();
      }
    });
  };

  const profileUrl = item.authorProfileUrl || item.sourceUrl;

  return (
    <article className="rounded-2xl border border-white/10 bg-black/45 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase text-cyan-300">{SOURCE_TYPE_LABELS[item.sourceType] ?? item.sourceType}</p>
          <p className="mt-1 text-sm font-bold text-white">{item.sourceName ?? item.authorName ?? 'Captured lead'}</p>
          <p className="mt-1 text-[10px] uppercase text-emerald-300">{INTENT_LABELS[item.detectedIntent] ?? item.detectedIntent} · {item.status.replace(/_/g, ' ')}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-lg font-black text-emerald-300">{money(item.estimatedRevenue)}</p>
          <p className="text-[10px] text-zinc-500">{item.confidenceScore}% conf · {item.urgencyScore}% urgency</p>
        </div>
      </div>

      <p className="mt-3 line-clamp-4 text-xs text-zinc-300">{item.rawText}</p>

      <p className="mt-3 rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-100">
        <span className="font-black uppercase text-cyan-300">Why flagged: </span>{item.whyTitanFlagged}
      </p>

      <p className="mt-3 rounded-xl border border-white/6 bg-white/5 p-3 text-xs italic text-zinc-300">{item.recommendedReply}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => { void navigator.clipboard.writeText(item.recommendedReply); setMsg('Reply copied.'); }} className="inline-flex items-center gap-1 rounded-lg bg-gold px-3 py-2 text-[10px] font-black uppercase text-black">
          <Copy className="h-3 w-3" /> Copy reply
        </button>
        {profileUrl && !profileUrl.startsWith('google_places:') ? (
          <a href={profileUrl.startsWith('http') ? profileUrl : '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-white">
            <ExternalLink className="h-3 w-3" /> Source
          </a>
        ) : null}
        <button type="button" disabled={pending} onClick={() => act(() => markLeadStatusAction(item.id, 'replied'), 'Marked replied.')} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-[10px] font-black uppercase text-emerald-200 disabled:opacity-50">Mark replied</button>
        <button type="button" disabled={pending} onClick={() => act(() => markLeadStatusAction(item.id, 'ignored'), 'Ignored.')} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-400 disabled:opacity-50">Ignore</button>
        <button type="button" disabled={pending || Boolean(item.opportunityId)} onClick={() => act(() => convertLeadToOpportunityAction(item.id), 'Converted to Opportunity Board.')} className="rounded-lg border border-gold/30 px-3 py-2 text-[10px] font-black uppercase text-gold-soft disabled:opacity-50">
          {item.opportunityId ? 'Converted' : 'Convert to opportunity'}
        </button>
        <button type="button" disabled={pending} onClick={() => setShowFollowUp((v) => !v)} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-300 disabled:opacity-50">Follow-up</button>
      </div>

      {showFollowUp ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-white/8 pt-3">
          {(['tomorrow', '2days', '3days', '1week'] as const).map((p) => (
            <button key={p} type="button" disabled={pending} onClick={() => act(() => scheduleLeadFollowUpAction(item.id, p), 'Scheduled')} className="rounded-lg bg-white/5 px-3 py-2 text-[10px] font-black uppercase text-white">
              {p === 'tomorrow' ? 'Tomorrow' : p === '2days' ? '2 days' : p === '3days' ? '3 days' : '1 week'}
            </button>
          ))}
          <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} className="rounded-lg border border-white/10 bg-black px-2 py-2 text-xs text-white" />
          <button type="button" disabled={!customDate || pending} onClick={() => act(() => scheduleLeadFollowUpAction(item.id, 'custom', `${customDate}T10:00:00`), 'Scheduled')} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-white">Custom</button>
        </div>
      ) : null}

      {msg ? <p className="mt-2 text-xs text-emerald-200">{msg}</p> : null}
    </article>
  );
}

export function TitanLeadRadarClient({
  items,
  summary,
  tablesReady,
  placesConfigured,
  huntCategories,
  playbooks,
  playbooksReady,
}: {
  items: LeadRadarItem[];
  summary: LeadRadarSummary;
  tablesReady: boolean;
  placesConfigured: boolean;
  huntCategories: HuntCategory[];
  playbooks: LeadPlaybook[];
  playbooksReady: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [importSource, setImportSource] = useState('facebook_group');

  useEffect(() => {
    if (searchParams.get('capture') === '1') setCaptureOpen(true);
  }, [searchParams]);

  if (!tablesReady) {
    return (
      <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6">
        <p className="text-sm text-amber-100">Apply migration <code className="text-amber-200">000101_titan_lead_radar.sql</code> in Supabase.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/titan" className="text-[10px] font-black uppercase text-zinc-500 hover:text-white">← Titan AI Business Operator</Link>
          <div className="mt-2 flex items-center gap-2">
            <Radar className="h-5 w-5 text-cyan-400" />
            <h1 className="text-2xl font-black text-white">Lead Radar</h1>
          </div>
          <p className="mt-1 text-sm text-zinc-400">Manual-assisted lead capture — paste posts, classify intent, copy replies, convert to Opportunity Board.</p>
          <p className="mt-2 text-xs text-zinc-500">Messy Facebook/Nextdoor paste supported — Titan extracts name, intent, location, and contact when visible.</p>
        </div>
        <button type="button" onClick={() => setCaptureOpen(true)} className="inline-flex items-center gap-1 rounded-xl bg-cyan-500 px-4 py-2 text-[10px] font-black uppercase text-black">
          <Plus className="h-3.5 w-3.5" /> Capture lead
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'New leads', value: summary.newCount },
          { label: 'High confidence', value: summary.highConfidenceCount },
          { label: 'Needs reply', value: summary.needsReplyCount },
          { label: 'Converted', value: summary.convertedCount },
          { label: 'Est. revenue', value: money(summary.estimatedRevenueTotal) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/8 bg-black/40 px-4 py-3">
            <p className="text-[10px] font-black uppercase text-zinc-600">{s.label}</p>
            <p className="mt-1 font-mono text-lg font-black text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {banner ? <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{banner}</p> : null}

      <Titan24HourHunt categories={huntCategories} playbooks={playbooks} playbooksReady={playbooksReady} />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
          <h2 className="text-sm font-black uppercase text-white">Paste posts / comments</h2>
          <p className="mt-1 text-xs text-zinc-500">Paste messy group posts or comment threads. Separate multiple items with a blank line.</p>
          <select value={importSource} onChange={(e) => setImportSource(e.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white">
            {SOURCE_TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={6} placeholder="Paste Facebook, Nextdoor, or Reddit posts here…" className="mt-3 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <button
            type="button"
            disabled={pending || !importText.trim()}
            onClick={() => startTransition(async () => {
              const res = await bulkImportLeadsAction(importText, importSource);
              setBanner(res.error ?? `Imported ${res.imported ?? 0} lead(s).`);
              if (res.ok) { setImportText(''); router.refresh(); }
            })}
            className="mt-3 rounded-xl bg-emerald-500/20 px-4 py-2 text-[10px] font-black uppercase text-emerald-200 disabled:opacity-40"
          >
            Import & classify
          </button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
          <h2 className="text-sm font-black uppercase text-white">Search query suggestions</h2>
          <ul className="mt-3 space-y-2">
            {SEARCH_SUGGESTIONS.map((q) => (
              <li key={q} className="rounded-lg border border-white/6 px-3 py-2 text-xs text-zinc-300">{q}</li>
            ))}
          </ul>
          <p className="mt-4 text-[10px] font-black uppercase text-zinc-500">Try on</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PLATFORM_SUGGESTIONS.map((p) => (
              <span key={p} className="rounded-full border border-cyan-500/20 px-3 py-1 text-[10px] font-bold text-cyan-200">{p}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-violet-500/20 bg-violet-500/5 p-5">
        <h2 className="text-sm font-black uppercase text-white">Google Places discovery</h2>
        {!placesConfigured ? (
          <div className="mt-3 text-xs text-zinc-400">
            <p>Set in Vercel production:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 font-mono text-violet-200">
              <li>GOOGLE_PLACES_API_KEY</li>
              <li>BUSINESS_LAT / BUSINESS_LNG (optional — defaults to Austin)</li>
            </ul>
            <p className="mt-2">Enable Places API (New) in Google Cloud Console. Manual capture works without this.</p>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => {
              const res = await runGooglePlacesLeadRadarAction();
              setBanner(res.error ?? `Added ${res.created ?? 0} Google Places targets.`);
              router.refresh();
            })}
            className="mt-3 rounded-xl bg-violet-500 px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50"
          >
            Run Google Places scan
          </button>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <TitanCompetitorReviewTool />
        <TitanOutreachScriptsPanel />
      </div>

      {items.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-black/40 p-8 text-center">
          <p className="text-sm font-bold text-white">No radar leads yet.</p>
          <p className="mt-2 text-xs text-zinc-400">Capture or paste posts from Facebook groups, Nextdoor, Reddit, or referrals.</p>
          <button type="button" onClick={() => setCaptureOpen(true)} className="mt-4 rounded-xl bg-cyan-500 px-5 py-3 text-[10px] font-black uppercase text-black">Capture first lead</button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <LeadCard key={item.id} item={item} />
          ))}
        </div>
      )}

      <CaptureModal open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </div>
  );
}

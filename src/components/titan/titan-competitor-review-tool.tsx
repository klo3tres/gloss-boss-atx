'use client';

import { useState, useTransition } from 'react';
import { analyzeCompetitorReviewsAction } from '@/app/(dashboard)/admin/titan/lead-radar-actions';
import type { CompetitorAnalysis } from '@/lib/titan/competitor-review-analysis';

const PAIN_LABELS: Record<string, string> = {
  overpriced: 'Overpriced',
  no_show: 'No-show',
  poor_communication: 'Poor communication',
  bad_interior: 'Bad interior cleaning',
  missed_stains: 'Missed stains',
  scheduling_issues: 'Scheduling issues',
  rude_service: 'Rude service',
  slow_response: 'Slow response',
  good_but_expensive: 'Good quality but expensive',
  wanted_mobile: 'Customer wanted mobile service',
};

export function TitanCompetitorReviewTool() {
  const [pending, startTransition] = useTransition();
  const [competitorName, setCompetitorName] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CompetitorAnalysis | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await analyzeCompetitorReviewsAction({
        competitorName,
        reviewText,
        sourceUrl,
        notes,
      });
      if (res.error) setErr(res.error);
      else if (res.analysis) setAnalysis(res.analysis);
    });
  };

  return (
    <section className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-5">
      <h2 className="text-sm font-black uppercase text-white">Analyze competitor reviews</h2>
      <p className="mt-1 text-xs text-zinc-500">Paste Google/Yelp/Facebook reviews manually — Titan classifies pain points and positioning angles.</p>

      <form onSubmit={submit} className="mt-4 grid gap-3">
        <input
          value={competitorName}
          onChange={(e) => setCompetitorName(e.target.value)}
          placeholder="Competitor name"
          required
          className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white"
        />
        <textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="Paste review text (multiple reviews OK)"
          required
          rows={6}
          className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white"
        />
        <input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="Source URL (optional)"
          className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-xl bg-rose-500/30 px-4 py-2 text-[10px] font-black uppercase text-rose-100 disabled:opacity-50"
        >
          Analyze reviews
        </button>
      </form>

      {err ? <p className="mt-2 text-xs text-rose-300">{err}</p> : null}

      {analysis ? (
        <div className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm">
          <div>
            <p className="text-[10px] font-black uppercase text-rose-300">Pain points</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {analysis.painPoints.length === 0 ? (
                <span className="text-zinc-500">No strong pain signals — use general mobile/trust positioning.</span>
              ) : (
                analysis.painPoints.map((p) => (
                  <span key={p} className="rounded-full border border-rose-500/30 px-3 py-1 text-[10px] font-bold text-rose-200">
                    {PAIN_LABELS[p] ?? p}
                  </span>
                ))
              )}
            </div>
          </div>
          <div><p className="text-[10px] font-black uppercase text-zinc-500">Positioning</p><p className="mt-1 text-zinc-200">{analysis.positioning}</p></div>
          <div><p className="text-[10px] font-black uppercase text-zinc-500">Message angle</p><p className="mt-1 text-zinc-200">{analysis.messageAngle}</p></div>
          <div><p className="text-[10px] font-black uppercase text-zinc-500">Service package</p><p className="mt-1 text-zinc-200">{analysis.servicePackage}</p></div>
          <div><p className="text-[10px] font-black uppercase text-zinc-500">Customer frustrations</p><p className="mt-1 text-zinc-200">{analysis.customerFrustrations}</p></div>
        </div>
      ) : null}
    </section>
  );
}

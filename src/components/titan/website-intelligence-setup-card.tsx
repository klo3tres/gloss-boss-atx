import Link from 'next/link';
import { CheckCircle2, CircleDashed, Globe } from 'lucide-react';
import type { WebsiteIntelligenceSummary } from '@/lib/titan/website-intelligence-types';

export function WebsiteIntelligenceSetupCard({ summary }: { summary: WebsiteIntelligenceSummary }) {
  const rows = [
    { label: 'GA configured', ok: summary.gaConfigured },
    { label: 'Clarity configured', ok: summary.clarityConfigured },
    { label: 'Search Console verified', ok: summary.searchConsoleVerified },
    { label: 'Reviews visible', ok: summary.reviewsVisible },
  ];

  const done = rows.filter((r) => r.ok).length;

  return (
    <section className="rounded-3xl border border-violet-500/25 bg-black/55 p-6">
      <div className="flex items-start gap-3">
        <Globe className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Website · Trust center</p>
          <h2 className="mt-1 text-sm font-black uppercase text-white">Website Intelligence</h2>
          <p className="mt-2 text-xs text-zinc-400">
            {done} of {rows.length} visibility checks passing — analytics, SEO, Clarity, and reviews in one place.
          </p>
          <ul className="mt-4 space-y-2">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center gap-2 text-xs text-zinc-300">
                {row.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                ) : (
                  <CircleDashed className="h-4 w-4 shrink-0 text-amber-300" />
                )}
                {row.label}
              </li>
            ))}
          </ul>
          <Link
            href="/admin/titan/website-intelligence"
            className="mt-4 inline-flex rounded-xl border border-violet-500/35 bg-violet-500/10 px-4 py-2 text-[10px] font-black uppercase text-violet-200 hover:text-white"
          >
            Open Website Intelligence →
          </Link>
        </div>
      </div>
    </section>
  );
}

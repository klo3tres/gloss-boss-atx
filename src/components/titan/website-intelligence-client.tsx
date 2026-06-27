'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  BarChart3,
  ExternalLink,
  Globe,
  MessageSquare,
  Search,
  Sparkles,
  Star,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  integrationStatusLabel,
  type IntegrationCard,
  type IntegrationCardStatus,
  type TitanWebsiteRecommendation,
  type WebsiteIntelligenceBundle,
} from '@/lib/titan/website-intelligence-types';
import { TitanPageGuide, TITAN_GUIDES } from '@/components/titan/titan-page-guide';
import {
  deleteManualReviewAction,
  saveManualReviewAction,
  saveSearchConsoleSettingsAction,
  syncGoogleReviewsAction,
} from '@/app/(dashboard)/admin/titan/website-intelligence-actions';

const STATUS_STYLES: Record<IntegrationCardStatus, string> = {
  configured: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  connected: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30',
  missing: 'bg-rose-500/15 text-rose-200 border-rose-500/30',
  needs_oauth: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  needs_verification: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
};

const REC_TONE: Record<TitanWebsiteRecommendation['tone'], string> = {
  info: 'border-white/10 bg-black/40',
  action: 'border-gold/25 bg-gold/5',
  success: 'border-emerald-500/25 bg-emerald-500/10',
  warning: 'border-amber-500/30 bg-amber-500/10',
};

function IntegrationCardView({ card }: { card: IntegrationCard }) {
  return (
    <article className={`rounded-2xl border p-4 ${STATUS_STYLES[card.status]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-black uppercase text-white">{card.label}</h3>
        <span className="rounded-full border px-2 py-0.5 text-[9px] font-black uppercase">
          {integrationStatusLabel(card.status)}
        </span>
      </div>
      {card.maskedId ? (
        <p className="mt-2 font-mono text-xs text-zinc-300">{card.maskedId}</p>
      ) : null}
      <p className="mt-2 text-xs text-zinc-400">{card.description}</p>
      <ul className="mt-3 space-y-1 text-[11px] text-zinc-500">
        {card.setupInstructions.map((line) => (
          <li key={line}>• {line}</li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {card.testHref ? (
          <a
            href={card.testHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-[10px] font-black uppercase text-zinc-200 hover:border-gold/30 hover:text-gold-soft"
          >
            {card.testLabel ?? 'Test'} <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        <span className="text-[9px] text-zinc-600">
          Checked {new Date(card.lastCheckedAt).toLocaleString()}
        </span>
      </div>
    </article>
  );
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/40 px-4 py-3">
      <p className="text-[10px] font-black uppercase text-zinc-600">{label}</p>
      <p className="mt-1 font-mono text-xl font-black text-white">{value}</p>
    </div>
  );
}

export function WebsiteIntelligenceClient({ bundle }: { bundle: WebsiteIntelligenceBundle }) {
  const router = useRouter();
  const [gscMsg, setGscMsg] = useState<string | null>(null);
  const [gscErr, setGscErr] = useState<string | null>(null);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [reviewErr, setReviewErr] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const topPublished = useMemo(
    () =>
      bundle.reviews
        .filter((r) => r.published)
        .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
        .slice(0, 3),
    [bundle.reviews],
  );

  const saveGsc = (formData: FormData) => {
    setGscMsg(null);
    setGscErr(null);
    startTransition(async () => {
      const res = await saveSearchConsoleSettingsAction(formData);
      if (res.ok) {
        setGscMsg(res.message ?? 'Saved.');
        router.refresh();
      } else setGscErr(res.error ?? 'Save failed.');
    });
  };

  const saveReview = (formData: FormData) => {
    setReviewMsg(null);
    setReviewErr(null);
    startTransition(async () => {
      const res = await saveManualReviewAction(formData);
      if (res.ok) {
        setReviewMsg(res.message ?? 'Review saved.');
        router.refresh();
      } else setReviewErr(res.error ?? 'Save failed.');
    });
  };

  const runSync = () => {
    setSyncMsg(null);
    startTransition(async () => {
      const res = await syncGoogleReviewsAction();
      setSyncMsg(res.ok ? res.message ?? 'Synced.' : res.error ?? 'Sync failed.');
      if (res.ok) router.refresh();
    });
  };

  const metrics7 = bundle.gaMetrics?.metrics7;
  const metrics28 = bundle.gaMetrics?.metrics28;

  return (
    <div className="space-y-8">
      <header className="rounded-[2rem] border border-violet-500/20 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.14),transparent_40%),linear-gradient(135deg,rgba(9,9,11,0.98),rgba(0,0,0,0.98))] p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/admin/titan" className="text-[10px] font-black uppercase text-zinc-500 hover:text-white">
              ← Titan AI Business Operator
            </Link>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.35em] text-violet-300">Website Operator</p>
            <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Website Intelligence</h1>
            <p className="mt-3 max-w-2xl text-sm text-zinc-400">
              Trust center for analytics, SEO, Clarity, and reviews — honest status only, no fake API data.
            </p>
          </div>
          <p className="text-[10px] text-zinc-600">Last checked {new Date(bundle.checkedAt).toLocaleString()}</p>
        </div>
        <nav className="mt-6 flex flex-wrap gap-2 border-t border-white/8 pt-5 text-[10px] font-black uppercase">
          {[
            ['#integrations', 'Integrations'],
            ['#ga-traffic', 'Traffic'],
            ['#search-console', 'SEO'],
            ['#clarity', 'Clarity'],
            ['#google-reviews', 'Reviews'],
            ['#recommendations', 'Titan picks'],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-xl border border-white/10 px-3 py-2 text-zinc-400 hover:border-violet-500/30 hover:text-white">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <TitanPageGuide config={TITAN_GUIDES.websiteIntelligence} />

      <section id="integrations" className="scroll-mt-24 rounded-3xl border border-white/10 bg-black/55 p-6">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-violet-300" />
          <h2 className="text-sm font-black uppercase text-white">Integration status</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-500">What is configured on the site vs connected via API.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {bundle.integrations.map((card) => (
            <IntegrationCardView key={card.id} card={card} />
          ))}
        </div>
      </section>

      <section id="ga-traffic" className="scroll-mt-24 rounded-3xl border border-white/10 bg-black/55 p-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-300" />
          <h2 className="text-sm font-black uppercase text-white">Traffic snapshot</h2>
        </div>
        {!bundle.gaDataApiConnected ? (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-bold">Data API not connected yet</p>
            <p className="mt-2 text-xs text-amber-50/90">
              GA tag <span className="font-mono">{bundle.workspace.gaMeasurementId}</span> is installed. Verify hits in{' '}
              <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer" className="underline">
                GA Realtime
              </a>
              . To show metrics here, set{' '}
              <code className="text-[10px]">GOOGLE_ANALYTICS_PROPERTY_ID</code>,{' '}
              <code className="text-[10px]">GOOGLE_ANALYTICS_CLIENT_EMAIL</code>, and{' '}
              <code className="text-[10px]">GOOGLE_ANALYTICS_PRIVATE_KEY</code> in Vercel.
            </p>
          </div>
        ) : bundle.gaDataApiError ? (
          <p className="mt-4 text-sm text-rose-200">{bundle.gaDataApiError}</p>
        ) : metrics7 && metrics28 ? (
          <div className="mt-5 space-y-6">
            <div>
              <p className="text-[10px] font-black uppercase text-zinc-500">Last 7 days (live API)</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <MetricTile label="Users" value={metrics7.users} />
                <MetricTile label="Sessions" value={metrics7.sessions} />
                <MetricTile label="Page views" value={metrics7.views} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-zinc-500">Last 28 days</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <MetricTile label="Users" value={metrics28.users} />
                <MetricTile label="Sessions" value={metrics28.sessions} />
                <MetricTile label="Page views" value={metrics28.views} />
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-black/40 p-4">
                <p className="text-[10px] font-black uppercase text-zinc-500">Top pages (7d)</p>
                <ul className="mt-3 space-y-2 text-xs">
                  {metrics7.topPages.length === 0 ? (
                    <li className="text-zinc-500">No page data yet.</li>
                  ) : (
                    metrics7.topPages.map((p) => (
                      <li key={p.path} className="flex justify-between gap-2">
                        <span className="truncate text-zinc-300">{p.path}</span>
                        <span className="font-mono text-emerald-300">{p.views}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/40 p-4">
                <p className="text-[10px] font-black uppercase text-zinc-500">Traffic sources (7d)</p>
                <ul className="mt-3 space-y-2 text-xs">
                  {metrics7.trafficSources.length === 0 ? (
                    <li className="text-zinc-500">No source data yet.</li>
                  ) : (
                    metrics7.trafficSources.map((s) => (
                      <li key={s.source} className="flex justify-between gap-2">
                        <span className="text-zinc-300">{s.source}</span>
                        <span className="font-mono text-cyan-300">{s.sessions}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
            {metrics7.conversions?.length ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-[10px] font-black uppercase text-emerald-300">Conversion signals (7d)</p>
                <ul className="mt-2 space-y-1 text-xs text-zinc-300">
                  {metrics7.conversions.map((c) => (
                    <li key={c.event}>
                      {c.event}: <span className="font-mono text-white">{c.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section id="search-console" className="scroll-mt-24 rounded-3xl border border-white/10 bg-black/55 p-6">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-cyan-300" />
          <h2 className="text-sm font-black uppercase text-white">Search Console / SEO</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-500">DNS TXT verification — manual status until Search Console API is wired.</p>

        <form action={saveGsc} className="mt-5 grid gap-4 rounded-2xl border border-white/8 bg-black/40 p-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-zinc-300 md:col-span-2">
            <input
              type="checkbox"
              name="gsc_verified"
              defaultChecked={bundle.workspace.gscVerified === true}
              className="rounded border-zinc-600"
            />
            Property verified in Search Console (DNS TXT)
          </label>
          <label className="block text-xs">
            <span className="font-black uppercase text-zinc-500">Property URL</span>
            <input
              name="gsc_property_url"
              defaultValue={bundle.workspace.gscPropertyUrl ?? ''}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs">
            <span className="font-black uppercase text-zinc-500">Last verified date</span>
            <input
              type="date"
              name="gsc_last_verified_at"
              defaultValue={
                bundle.workspace.gscLastVerifiedAt
                  ? bundle.workspace.gscLastVerifiedAt.slice(0, 10)
                  : ''
              }
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs md:col-span-2">
            <span className="font-black uppercase text-zinc-500">Notes</span>
            <textarea
              name="gsc_verification_note"
              rows={3}
              defaultValue={bundle.workspace.gscVerificationNote ?? ''}
              placeholder="DNS TXT record confirmed, sitemap submitted, etc."
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-violet-500 px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50"
            >
              Save Search Console status
            </button>
            {gscMsg ? <p className="mt-2 text-xs text-emerald-200">{gscMsg}</p> : null}
            {gscErr ? <p className="mt-2 text-xs text-rose-200">{gscErr}</p> : null}
          </div>
        </form>

        <div className="mt-4 rounded-xl border border-white/8 bg-zinc-950/50 p-4 text-xs text-zinc-400">
          <p className="font-bold text-zinc-300">Verification steps</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Add the Google Search Console DNS TXT record at your domain host.</li>
            <li>Wait for Google to confirm ownership (can take up to 48 hours).</li>
            <li>Toggle verified above and submit your sitemap URL.</li>
          </ol>
          {bundle.searchConsoleApiConfigured ? (
            <p className="mt-3 text-cyan-200">GOOGLE_SEARCH_CONSOLE_SITE_URL is set — API metrics can be added in a future release.</p>
          ) : (
            <p className="mt-3">Future API: set GOOGLE_SEARCH_CONSOLE_SITE_URL for clicks, impressions, CTR, and top queries.</p>
          )}
        </div>
      </section>

      <section id="clarity" className="scroll-mt-24 rounded-3xl border border-white/10 bg-black/55 p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-fuchsia-300" />
          <h2 className="text-sm font-black uppercase text-white">Microsoft Clarity</h2>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
            <p className="text-[10px] font-black uppercase text-zinc-400">Project ID</p>
            <p className="mt-2 font-mono text-sm text-white">{bundle.workspace.clarityProjectId}</p>
            <p className="mt-2 text-xs text-zinc-400">Script installed: {bundle.clarityScriptInstalled ? 'Yes' : 'No'}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-400">
            <p>Clarity recordings appear after traffic is captured.</p>
            <a
              href="https://clarity.microsoft.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 rounded-xl border border-white/15 px-3 py-2 text-[10px] font-black uppercase text-zinc-200 hover:text-white"
            >
              Open Clarity dashboard <ExternalLink className="h-3 w-3" />
            </a>
            <p className="mt-3 text-[10px] text-zinc-600">
              Optional env: CLARITY_PROJECT_ID, CLARITY_API_TOKEN
              {bundle.clarityApiConfigured ? ' (token set)' : ''}
            </p>
          </div>
        </div>
      </section>

      <section id="google-reviews" className="scroll-mt-24 rounded-3xl border border-white/10 bg-black/55 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-gold-soft" />
            <h2 className="text-sm font-black uppercase text-white">Google Reviews</h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            {bundle.averageRating ? (
              <>
                <Star className="h-4 w-4 fill-gold text-gold" />
                <span className="font-black">{bundle.averageRating}</span>
                <span className="text-zinc-500">({bundle.publishedReviewCount} published)</span>
              </>
            ) : (
              <span className="text-zinc-500">No published reviews</span>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/8 bg-black/40 p-3 text-xs">
            <p className="font-black uppercase text-zinc-500">Review link</p>
            <p className="mt-1 break-all text-zinc-300">{bundle.googleReviewUrl || 'Not set'}</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/40 p-3 text-xs">
            <p className="font-black uppercase text-zinc-500">Places API sync</p>
            <p className="mt-1 text-zinc-300">{bundle.googleReviewsApiReady ? 'Ready' : 'Needs GOOGLE_PLACES_API_KEY'}</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/40 p-3 text-xs">
            <p className="font-black uppercase text-zinc-500">Last synced</p>
            <p className="mt-1 text-zinc-300">
              {bundle.googleReviewsLastSyncAt
                ? new Date(bundle.googleReviewsLastSyncAt).toLocaleString()
                : 'Never'}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runSync}
            disabled={!bundle.googleReviewsApiReady || pending}
            className="inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} />
            Sync Google reviews
          </button>
          <Link
            href="/admin/cms?tab=hours"
            className="rounded-xl border border-white/15 px-4 py-2 text-[10px] font-black uppercase text-zinc-300 hover:text-white"
          >
            CMS review settings
          </Link>
        </div>
        {syncMsg ? <p className="mt-2 text-xs text-zinc-300">{syncMsg}</p> : null}

        {!bundle.googleReviewsApiReady ? (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            Connect Google Reviews roadmap: full Business Profile OAuth is not wired yet. Use manual import below or
            Places API sync when GOOGLE_PLACES_API_KEY is set.
          </p>
        ) : null}

        {topPublished.length > 0 ? (
          <div className="mt-5">
            <p className="text-[10px] font-black uppercase text-zinc-500">Homepage preview (top published)</p>
            <ul className="mt-3 space-y-2">
              {topPublished.map((r) => (
                <li key={r.id} className="rounded-xl border border-white/8 bg-black/40 p-3 text-xs">
                  <div className="flex items-center gap-1 text-gold-soft">
                    {Array.from({ length: r.rating }).map((_, i) => (
                      <Star key={i} className="h-3 w-3 fill-current" />
                    ))}
                  </div>
                  <p className="mt-1 font-bold text-white">{r.customer_name}</p>
                  <p className="mt-1 text-zinc-400 line-clamp-2">{r.testimonial}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <details className="mt-6 rounded-2xl border border-white/8 bg-black/30 p-4">
          <summary className="cursor-pointer text-[10px] font-black uppercase text-zinc-400">
            Manual review import / add ({bundle.reviews.length} total)
          </summary>
          <form action={saveReview} className="mt-4 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="source" value="Manual" />
            <label className="text-xs md:col-span-2">
              <span className="text-zinc-500">Review text *</span>
              <textarea name="testimonial" required rows={3} className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs">
              <span className="text-zinc-500">Customer name</span>
              <input name="customer_name" className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs">
              <span className="text-zinc-500">Rating</span>
              <input name="rating" type="number" min={1} max={5} defaultValue={5} className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
            </label>
            <label className="flex items-center gap-2 text-xs md:col-span-2">
              <input type="checkbox" name="published" defaultChecked className="rounded" />
              Publish on homepage
            </label>
            <div className="md:col-span-2">
              <button type="submit" disabled={pending} className="rounded-xl bg-emerald-500 px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50">
                Add review
              </button>
              {reviewMsg ? <p className="mt-2 text-xs text-emerald-200">{reviewMsg}</p> : null}
              {reviewErr ? <p className="mt-2 text-xs text-rose-200">{reviewErr}</p> : null}
            </div>
          </form>
          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto text-xs">
            {bundle.reviews.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 px-3 py-2">
                <span className="text-zinc-300">
                  {r.customer_name} · {r.rating}★ · {r.published ? 'published' : 'draft'} · {r.source}
                </span>
                <form
                  action={async (fd) => {
                    await deleteManualReviewAction(fd);
                    router.refresh();
                  }}
                >
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="text-[10px] font-black uppercase text-rose-300 hover:text-rose-100">
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section id="recommendations" className="scroll-mt-24 rounded-3xl border border-gold/20 bg-black/55 p-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-gold-soft" />
          <h2 className="text-sm font-black uppercase text-white">Titan recommendations</h2>
        </div>
        <ul className="mt-5 space-y-3">
          {bundle.recommendations.map((rec) => (
            <li key={rec.id} className={`rounded-2xl border p-4 ${REC_TONE[rec.tone]}`}>
              <p className="text-sm font-bold text-white">{rec.title}</p>
              <p className="mt-1 text-xs text-zinc-400">{rec.detail}</p>
              {rec.href ? (
                rec.href.startsWith('http') ? (
                  <a href={rec.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[10px] font-black uppercase text-gold-soft">
                    Open →
                  </a>
                ) : (
                  <Link href={rec.href} className="mt-2 inline-block text-[10px] font-black uppercase text-gold-soft">
                    Take action →
                  </Link>
                )
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

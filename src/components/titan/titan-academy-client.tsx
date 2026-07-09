'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Play, Sparkles, TrendingUp } from 'lucide-react';
import {
  ACADEMY_CATEGORIES,
  ACADEMY_RESOURCES,
  BUSINESS_MODELS,
  type AcademyResource,
} from '@/lib/titan/business-academy';
import type { AcademyRecommendation } from '@/lib/titan/academy-recommendations';
import type { CmsAcademyArticle } from '@/components/admin/cms-academy-articles-client';
import { GlassCard, SectionEyebrow } from '@/components/ui/premium';

const TYPE_ICON = { video: Play, article: Sparkles, model: TrendingUp, tool: Sparkles } as const;

function isRealVideoUrl(href: string) {
  return /youtube\.com\/watch|youtu\.be\/|vimeo\.com\//i.test(href);
}

function isYouTubeSearch(href: string) {
  return /youtube\.com\/results\?search_query/i.test(href);
}

function resourceDisplayType(item: AcademyResource) {
  if (item.type === 'video' && isYouTubeSearch(item.href)) return 'recommended search';
  if (item.type === 'video' && !isRealVideoUrl(item.href)) return 'playbook';
  return item.type;
}

function ResourceCard({ item, progress = 0 }: { item: AcademyResource; progress?: number }) {
  const displayType = resourceDisplayType(item);
  const Icon = TYPE_ICON[item.type];
  const external = item.href.startsWith('http');
  const isPlayableVideo = item.type === 'video' && isRealVideoUrl(item.href);
  const isSearchLink = item.type === 'video' && isYouTubeSearch(item.href);
  const className =
    'group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/45 transition hover:border-gold/35 hover:shadow-[0_8px_30px_rgba(212,175,55,0.08)] h-full';

  const thumb = (
    <div className="relative aspect-video bg-gradient-to-br from-zinc-900 via-black to-gold/10">
      {isPlayableVideo ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/40 bg-black/60 text-gold-soft transition group-hover:scale-110">
            <Play className="h-5 w-5 fill-current" />
          </span>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center opacity-50 gap-1">
          <Icon className="h-10 w-10 text-gold-soft" />
          {isSearchLink ? (
            <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500">Search YouTube</span>
          ) : displayType === 'playbook' ? (
            <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500">Recommended topic</span>
          ) : null}
        </div>
      )}
      {progress > 0 ? (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
          <div className="h-full bg-gold" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      ) : null}
    </div>
  );

  const body = (
    <>
      {thumb}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-black uppercase text-zinc-400">
            <Icon className="h-3 w-3" /> {displayType}
          </span>
          {item.duration ? <span className="text-[9px] text-zinc-600">{item.duration}</span> : null}
        </div>
        <h3 className="mt-2 text-sm font-black text-white group-hover:text-gold-soft">{item.title}</h3>
        <p className="mt-2 flex-1 text-xs leading-relaxed text-zinc-400">{item.summary}</p>
        {isSearchLink ? (
          <p className="mt-2 text-[9px] font-black uppercase tracking-wider text-gold-soft">Search YouTube →</p>
        ) : null}
      </div>
    </>
  );

  if (external) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" className={className}>
        {body}
      </a>
    );
  }
  return (
    <Link href={item.href} className={className}>
      {body}
    </Link>
  );
}

export function TitanAcademyClient({
  cmsArticles = [],
  recommendations = [],
}: {
  cmsArticles?: CmsAcademyArticle[];
  recommendations?: AcademyRecommendation[];
}) {
  const [category, setCategory] = useState<string>('all');

  const resources = useMemo(() => {
    const fromCms: AcademyResource[] = cmsArticles.map((a) => ({
      id: `cms-${a.id}`,
      title: a.title,
      summary: a.summary,
      type: a.type,
      category: a.category,
      href: a.href,
      duration: a.duration,
      provider: a.provider || 'Gloss Boss',
    }));
    const cmsIds = new Set(fromCms.map((r) => r.href));
    const curated = ACADEMY_RESOURCES.filter((r) => !cmsIds.has(r.href));
    return [...fromCms, ...curated];
  }, [cmsArticles]);

  const filtered = useMemo(
    () => (category === 'all' ? resources : resources.filter((r) => r.category === category)),
    [category, resources],
  );

  const continueWatching = resources.filter((r) => r.type === 'video').slice(0, 3);
  const popular = resources.slice(0, 4);

  return (
    <div className="space-y-8">
      {recommendations.length > 0 ? (
        <GlassCard glow className="border-gold/25">
          <SectionEyebrow>Titan recommends for you</SectionEyebrow>
          <div className="mt-4 space-y-4">
            {recommendations.map((rec) => (
              <div key={rec.id} className="rounded-2xl border border-gold/20 bg-gold/5 p-4">
                <p className="text-sm font-bold text-gold-soft">{rec.reason}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {rec.resources.map((r) => (
                    <ResourceCard key={r.id} item={r} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}

      {continueWatching.length > 0 ? (
        <section>
          <SectionEyebrow>Curated topics</SectionEyebrow>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {continueWatching.map((r, i) => (
              <ResourceCard key={r.id} item={r} progress={i === 0 ? 45 : i === 1 ? 20 : 0} />
            ))}
          </div>
        </section>
      ) : null}

      <GlassCard glow className="border-gold/20">
        <SectionEyebrow>Titan Business Academy</SectionEyebrow>
        <p className="mt-3 text-sm leading-relaxed text-zinc-300 max-w-3xl">
          Models, videos, and playbooks — sharpen operations, pricing, and AI-assisted growth.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {ACADEMY_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                category === c.id ? 'bg-gold text-black' : 'border border-white/15 text-zinc-400 hover:border-gold/30 hover:text-white'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => (
          <ResourceCard key={item.id} item={item} />
        ))}
      </div>

      <section>
        <SectionEyebrow>Popular this week</SectionEyebrow>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {popular.map((item) => (
            <ResourceCard key={`pop-${item.id}`} item={item} />
          ))}
        </div>
      </section>

      <section>
        <SectionEyebrow>Business models</SectionEyebrow>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {BUSINESS_MODELS.map((m) => (
            <GlassCard key={m.id}>
              <h3 className="text-sm font-black text-white">{m.name}</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">{m.description}</p>
              <p className="mt-3 text-[10px] font-bold uppercase text-gold-soft">{m.glossBossFit}</p>
            </GlassCard>
          ))}
        </div>
      </section>
    </div>
  );
}

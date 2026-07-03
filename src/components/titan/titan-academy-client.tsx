'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ExternalLink, Play, Sparkles, Wrench } from 'lucide-react';
import {
  ACADEMY_CATEGORIES,
  ACADEMY_RESOURCES,
  BUSINESS_MODELS,
  type AcademyResource,
} from '@/lib/titan/business-academy';
import type { CmsAcademyArticle } from '@/components/admin/cms-academy-articles-client';
import { GlassCard, SectionEyebrow } from '@/components/ui/premium';

const TYPE_ICON = {
  video: Play,
  article: BookOpen,
  model: Sparkles,
  tool: Wrench,
} as const;

function ResourceCard({ item }: { item: AcademyResource }) {
  const Icon = TYPE_ICON[item.type];
  const external = item.href.startsWith('http');
  const className =
    'group flex flex-col rounded-2xl border border-white/10 bg-black/45 p-4 transition hover:border-gold/30 hover:bg-black/60 h-full';

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-black uppercase text-zinc-400">
          <Icon className="h-3 w-3" /> {item.type}
        </span>
        {item.duration ? <span className="text-[9px] text-zinc-600">{item.duration}</span> : null}
      </div>
      <h3 className="mt-3 text-sm font-black text-white group-hover:text-gold-soft transition">{item.title}</h3>
      <p className="mt-2 flex-1 text-xs leading-relaxed text-zinc-400">{item.summary}</p>
      <p className="mt-3 flex items-center gap-1 text-[10px] font-bold uppercase text-gold-soft">
        {external ? 'Open resource' : 'Open in Gloss Boss'}
        <ExternalLink className="h-3 w-3" />
      </p>
    </>
  );

  if (external) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={item.href} className={className}>
      {inner}
    </Link>
  );
}

export function TitanAcademyClient({ cmsArticles = [] }: { cmsArticles?: CmsAcademyArticle[] }) {
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

  return (
    <div className="space-y-8">
      <GlassCard glow className="border-gold/20">
        <SectionEyebrow>Titan Business Academy</SectionEyebrow>
        <p className="mt-3 text-sm leading-relaxed text-zinc-300 max-w-3xl">
          Curated models, videos, and playbooks to sharpen operations, pricing, and AI-assisted growth — without leaving your command center.
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

      <section>
        <h2 className="text-sm font-black uppercase tracking-wider text-white mb-4">Business models for Gloss Boss</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {BUSINESS_MODELS.map((model) => (
            <article key={model.id} className="rounded-2xl border border-white/10 bg-zinc-950/60 p-5">
              <p className="text-[10px] font-black uppercase text-gold-soft">{model.name}</p>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">{model.description}</p>
              <ul className="mt-3 space-y-1 text-[11px] text-zinc-500">
                {model.metrics.map((m) => (
                  <li key={m}>· {m}</li>
                ))}
              </ul>
              <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px] text-emerald-100 leading-relaxed">
                <strong className="text-emerald-300">Gloss Boss fit:</strong> {model.glossBossFit}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-black uppercase tracking-wider text-white mb-4">Learn & apply</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <ResourceCard key={item.id} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}

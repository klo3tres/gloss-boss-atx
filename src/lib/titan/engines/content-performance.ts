import type { TitanBriefing } from '@/lib/titan-briefing';

export type ContentPerformanceInsight = {
  id: string;
  headline: string;
  detail: string;
  metric: string;
};

export type ContentPerformanceEngine = {
  insights: ContentPerformanceInsight[];
  topHook: string | null;
  topPlatform: string | null;
};

export function buildContentPerformanceEngine(briefing: TitanBriefing): ContentPerformanceEngine {
  const posts = briefing.growth.content.posts ?? [];
  const insights: ContentPerformanceInsight[] = [];

  if (posts.length >= 2) {
    const sorted = [...posts].sort((a, b) => b.leadsCount - a.leadsCount);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (best.leadsCount > 0 && worst.leadsCount >= 0) {
      const lift =
        worst.leadsCount > 0 ? Math.round(((best.leadsCount - worst.leadsCount) / worst.leadsCount) * 100) : 100;
      insights.push({
        id: 'top-post',
        headline: `"${best.title}" outperformed "${worst.title}" by ${lift}% on leads`,
        detail: `${best.views} views · ${best.leadsCount} leads · $${(best.revenueCents / 100).toFixed(0)} revenue`,
        metric: `${best.leadsCount} leads`,
      });
    }
  }

  const bmwPosts = posts.filter((p) => /bmw|pov|luxury|mercedes|audi/i.test(p.title + (p.hook ?? '')));
  const detailPosts = posts.filter((p) => /interior|transformation|before/i.test(p.title + (p.hook ?? '')));
  if (bmwPosts.length > 0 && detailPosts.length > 0) {
    const bmwLeads = bmwPosts.reduce((s, p) => s + p.leadsCount, 0) / bmwPosts.length;
    const intLeads = detailPosts.reduce((s, p) => s + p.leadsCount, 0) / detailPosts.length;
    if (bmwLeads > intLeads && intLeads > 0) {
      const pct = Math.round(((bmwLeads - intLeads) / intLeads) * 100);
      insights.push({
        id: 'bmw-vs-interior',
        headline: `BMW/POV-style content outperformed interior transformations by ${pct}% on leads`,
        detail: 'Titan recommends more luxury POV hooks for Meta',
        metric: `${pct}% lift`,
      });
    } else if (intLeads > bmwLeads && bmwLeads > 0) {
      const mult = (intLeads / bmwLeads).toFixed(1);
      insights.push({
        id: 'interior-wins',
        headline: `Interior transformations generate ${mult}× more leads than POV content`,
        detail: 'Double down on before/after interior reels',
        metric: `${mult}× leads`,
      });
    }
  }

  if (briefing.insights.topService) {
    insights.push({
      id: 'top-service',
      headline: `${briefing.insights.topService.label} is the top revenue service MTD`,
      detail: `Feature this package in the next 3 Meta posts`,
      metric: `$${(briefing.insights.topService.revenueCents / 100).toFixed(0)}`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'seed',
      headline: 'Log Meta posts in Titan Content to unlock performance comparisons',
      detail: 'Track views, leads, and bookings per post',
      metric: '—',
    });
  }

  const topPost = briefing.growth.content.topPost;
  return {
    insights,
    topHook: topPost?.hook ?? topPost?.title ?? null,
    topPlatform: topPost?.platform ?? null,
  };
}

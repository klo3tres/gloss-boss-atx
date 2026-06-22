import type { SupabaseClient } from '@supabase/supabase-js';

export type ContentPost = {
  id: string;
  platform: string;
  title: string;
  hook: string | null;
  views: number;
  leadsCount: number;
  bookingsCount: number;
  revenueCents: number;
  postedAt: string | null;
};

export type ContentRecommendation = {
  basedOnPostId: string;
  title: string;
  hook: string;
  caption: string;
  shotList: string[];
  reason: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function loadContentEngine(admin: SupabaseClient): Promise<{
  posts: ContentPost[];
  topPost: ContentPost | null;
  recommendation: ContentRecommendation | null;
  tablesReady: boolean;
}> {
  const probe = await admin.from('titan_content_posts').select('id').limit(1);
  if (probe.error) {
    return { posts: [], topPost: null, recommendation: null, tablesReady: false };
  }

  const { data } = await admin
    .from('titan_content_posts')
    .select('*')
    .order('revenue_cents', { ascending: false })
    .limit(30);

  const posts: ContentPost[] = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: str(r.id),
      platform: str(r.platform) || 'instagram',
      title: str(r.title),
      hook: str(r.hook) || null,
      views: Number(r.views ?? 0),
      leadsCount: Number(r.leads_count ?? 0),
      bookingsCount: Number(r.bookings_count ?? 0),
      revenueCents: cents(r.revenue_cents),
      postedAt: str(r.posted_at) || null,
    };
  });

  const topPost = posts.length
    ? [...posts].sort((a, b) => b.views * 0.3 + b.leadsCount * 1000 + b.revenueCents - (a.views * 0.3 + a.leadsCount * 1000 + a.revenueCents))[0]
    : null;

  let recommendation: ContentRecommendation | null = null;
  if (topPost) {
    recommendation = {
      basedOnPostId: topPost.id,
      title: `Similar to: ${topPost.title}`,
      hook: topPost.hook ?? 'Before/after transformation in under 60 seconds',
      caption: `Another Gloss Boss ATX transformation. Book mobile detailing — link in bio. #atx #mobiledetailing #beforeandafter`,
      shotList: [
        'Wide before — dirty vehicle in driveway',
        'Close-up paint swirls or interior mess',
        'Timelapse foam / extraction',
        'Hero after reveal — sun hit on paint',
        'CTA end card with booking link',
      ],
      reason: `Top performer: ${topPost.views.toLocaleString()} views · ${topPost.leadsCount} leads · $${(topPost.revenueCents / 100).toFixed(0)} revenue`,
    };
  }

  return { posts, topPost, recommendation, tablesReady: true };
}

export async function recordContentPost(
  admin: SupabaseClient,
  input: {
    platform: string;
    title: string;
    hook?: string;
    views?: number;
    leadsCount?: number;
    bookingsCount?: number;
    revenueCents?: number;
  },
) {
  const now = new Date().toISOString();
  await admin.from('titan_content_posts').insert({
    platform: input.platform,
    title: input.title,
    hook: input.hook ?? null,
    views: input.views ?? 0,
    leads_count: input.leadsCount ?? 0,
    bookings_count: input.bookingsCount ?? 0,
    revenue_cents: input.revenueCents ?? 0,
    posted_at: now,
    created_at: now,
    updated_at: now,
  });
}

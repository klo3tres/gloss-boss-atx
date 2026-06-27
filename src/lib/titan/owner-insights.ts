import type { SupabaseClient } from '@supabase/supabase-js';
import { displayMoney } from '@/lib/display-format';

export type OwnerInsight = {
  id: string;
  label: string;
  value: string;
  detail: string;
  href?: string;
  tone: 'neutral' | 'good' | 'warn' | 'action';
};

export type OwnerInsightsBundle = {
  insights: OwnerInsight[];
  nextBestAction: string;
};

function money(cents: number) {
  return displayMoney(cents);
}

export async function loadOwnerInsights(admin: SupabaseClient): Promise<OwnerInsightsBundle> {
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  const since = since30.toISOString();

  const [services, appts, opps, reviews, radar, balances, techJobs] = await Promise.all([
    admin.from('services').select('id, name, slug, base_price_cents, active').eq('active', true),
    admin.from('appointments').select('id, status, service_slug, base_price_cents, created_at, balance_due_cents').gte('created_at', since),
    admin.from('titan_opportunities').select('id, source_type, status, estimated_revenue, created_at').gte('created_at', since).limit(200),
    admin.from('customer_reviews').select('id, published').eq('published', true).limit(1),
    admin.from('titan_lead_radar_items').select('id, source_type, confidence_score, status').gte('created_at', since).limit(200),
    admin.from('appointments').select('id, balance_due_cents').gt('balance_due_cents', 0).in('status', ['confirmed', 'scheduled', 'booked', 'pending', 'completed']),
    admin.from('appointments').select('id, status, technician_id').eq('status', 'completed').gte('created_at', since),
  ]);

  const apptRows = appts.data ?? [];
  const completed = apptRows.filter((a) => String((a as { status?: string }).status) === 'completed');
  const serviceRevenue = new Map<string, { count: number; cents: number; label: string }>();
  for (const a of completed) {
    const slug = String((a as { service_slug?: string }).service_slug ?? 'unknown');
    const cents = Number((a as { base_price_cents?: number }).base_price_cents ?? 0);
    const svc = (services.data ?? []).find((s) => String((s as { slug?: string }).slug) === slug);
    const label = svc ? String((svc as { name?: string }).name) : slug;
    const cur = serviceRevenue.get(slug) ?? { count: 0, cents: 0, label };
    cur.count += 1;
    cur.cents += cents;
    serviceRevenue.set(slug, cur);
  }

  const ranked = [...serviceRevenue.values()].sort((a, b) => b.cents - a.cents);
  const best = ranked[0];
  const weakest = ranked.length > 1 ? ranked[ranked.length - 1] : null;

  const openBalanceCents = (balances.data ?? []).reduce((s, r) => s + Number((r as { balance_due_cents?: number }).balance_due_cents ?? 0), 0);

  const oppBySource = new Map<string, number>();
  for (const o of opps.data ?? []) {
    const src = String((o as { source_type?: string }).source_type ?? 'unknown');
    oppBySource.set(src, (oppBySource.get(src) ?? 0) + 1);
  }
  const topLeadSource = [...oppBySource.entries()].sort((a, b) => b[1] - a[1])[0];

  const highConfLeads = (radar.data ?? []).filter((r) => Number((r as { confidence_score?: number }).confidence_score ?? 0) >= 65).length;
  const needsReply = (radar.data ?? []).filter((r) => String((r as { status?: string }).status) === 'new').length;

  const techCount = new Set((techJobs.data ?? []).map((r) => String((r as { technician_id?: string }).technician_id)).filter(Boolean)).size;

  const insights: OwnerInsight[] = [
    best
      ? { id: 'best_service', label: 'Best-performing service (30d)', value: best.label, detail: `${best.count} jobs · ${money(best.cents)}`, tone: 'good' }
      : { id: 'best_service', label: 'Best-performing service', value: '—', detail: 'Complete jobs to see service rankings.', tone: 'neutral' },
    ranked[0]
      ? { id: 'top_revenue', label: 'Highest revenue service', value: money(ranked[0].cents), detail: ranked[0].label, tone: 'good' }
      : { id: 'top_revenue', label: 'Highest revenue service', value: '$0', detail: 'No completed jobs in 30 days.', tone: 'warn' },
    weakest && weakest.count > 0
      ? { id: 'weak_conv', label: 'Weaker service volume', value: weakest.label, detail: `${weakest.count} completed — consider promotion`, tone: 'warn', href: '/admin/services' }
      : { id: 'weak_conv', label: 'Service conversion', value: 'OK', detail: 'No weak service signal yet.', tone: 'neutral' },
    { id: 'open_bal', label: 'Open balances', value: money(openBalanceCents), detail: `${balances.data?.length ?? 0} appointment(s) with balance due`, tone: openBalanceCents > 0 ? 'action' : 'good', href: '/admin/work-orders' },
    { id: 'leads', label: 'Lead Radar today', value: String(highConfLeads), detail: `${needsReply} need reply · high-confidence captured (30d)`, tone: needsReply > 0 ? 'action' : 'neutral', href: '/admin/titan/lead-radar' },
    topLeadSource
      ? { id: 'lead_src', label: 'Top opportunity source', value: topLeadSource[0].replace(/_/g, ' '), detail: `${topLeadSource[1]} opportunities (30d)`, tone: 'neutral', href: '/admin/titan/opportunities' }
      : { id: 'lead_src', label: 'Lead sources', value: '—', detail: 'Convert radar leads to opportunities.', tone: 'action', href: '/admin/titan/lead-radar' },
    { id: 'tech', label: 'Tech workload (30d)', value: String(techJobs.data?.length ?? 0), detail: `${techCount} technician(s) with completed jobs`, tone: 'neutral', href: '/admin/team' },
    { id: 'reviews', label: 'Published reviews', value: (reviews.data?.length ?? 0) > 0 ? 'Live' : 'Empty', detail: (reviews.data?.length ?? 0) > 0 ? 'Homepage social proof active' : 'Sync or add reviews in CMS', tone: (reviews.data?.length ?? 0) > 0 ? 'good' : 'warn', href: '/admin/reviews' },
    { id: 'weather', label: 'Weather this week', value: 'Check calendar', detail: 'Open admin calendar for rain-risk days before scheduling.', tone: 'action', href: '/admin/calendar' },
  ];

  let nextBestAction = 'Text 3 warm leads and paste 5 buyer posts into Lead Radar.';
  if (needsReply > 0) nextBestAction = `Reply to ${needsReply} Lead Radar item(s) — copy suggested replies and mark replied.`;
  else if (openBalanceCents > 50000) nextBestAction = 'Collect open balances — follow up on appointments with balance due.';
  else if (highConfLeads === 0) nextBestAction = 'Run Today\'s hunt plan — search Facebook buyer-intent phrases and paste posts.';

  return { insights, nextBestAction };
}

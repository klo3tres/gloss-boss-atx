import type { SupabaseClient } from '@supabase/supabase-js';
import { buildOutreachForCustomer, type OutreachKit } from '@/lib/titan/engines/outreach';

export type ReferralStage = 'review' | 'referral' | 'discount' | 'follow_up' | 'complete';

export type ReferralCandidate = {
  id: string;
  customerName: string;
  appointmentId: string;
  completedAt: string;
  stage: ReferralStage;
  nextAction: string;
  outreach: OutreachKit;
  href: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function inferStage(daysSinceComplete: number, hasReview: boolean): ReferralStage {
  if (daysSinceComplete > 30) return 'complete';
  if (daysSinceComplete > 14) return 'follow_up';
  if (daysSinceComplete > 5) return 'discount';
  if (daysSinceComplete > 2) return 'referral';
  return 'review';
}

function nextActionForStage(stage: ReferralStage): string {
  if (stage === 'review') return 'Send review request (copy SMS below)';
  if (stage === 'referral') return 'Send referral offer — $25 for both';
  if (stage === 'discount') return 'Send book-again discount';
  if (stage === 'follow_up') return 'Win-back maintenance message';
  return 'Growth node complete';
}

export async function loadReferralEngine(admin: SupabaseClient): Promise<{
  candidates: ReferralCandidate[];
  autoPipelineEnabled: boolean;
}> {
  const since = new Date(Date.now() - 45 * 86400000).toISOString();
  const { data: appts } = await admin
    .from('appointments')
    .select('id, guest_name, customer_id, job_completed_at, updated_at, status')
    .eq('status', 'completed')
    .gte('job_completed_at', since)
    .order('job_completed_at', { ascending: false })
    .limit(40);

  const customerIds = [...new Set((appts ?? []).map((a) => str((a as { customer_id?: string }).customer_id)).filter(Boolean))];
  const reviewsByCustomer = new Set<string>();
  if (customerIds.length > 0) {
    const { data: reviews } = await admin
      .from('customer_reviews')
      .select('customer_id')
      .in('customer_id', customerIds)
      .limit(100);
    for (const r of reviews ?? []) {
      reviewsByCustomer.add(str((r as { customer_id?: string }).customer_id));
    }
  }

  const candidates: ReferralCandidate[] = [];
  for (const row of appts ?? []) {
    const a = row as Record<string, unknown>;
    const completedAt = str(a.job_completed_at) || str(a.updated_at);
    if (!completedAt) continue;
    const daysSince = (Date.now() - new Date(completedAt).getTime()) / 86400000;
    const cid = str(a.customer_id);
    const hasReview = cid ? reviewsByCustomer.has(cid) : false;
    const stage = hasReview && daysSince > 3 ? 'referral' : inferStage(daysSince, hasReview);
    if (stage === 'complete') continue;

    const name = str(a.guest_name) || 'Customer';
    candidates.push({
      id: str(a.id),
      customerName: name,
      appointmentId: str(a.id),
      completedAt,
      stage,
      nextAction: nextActionForStage(stage),
      outreach: buildOutreachForCustomer({ customerName: name, customerId: cid || undefined }),
      href: cid ? `/admin/customers/${cid}` : '/admin/customers',
    });
  }

  return {
    candidates: candidates.slice(0, 12),
    autoPipelineEnabled: true,
  };
}

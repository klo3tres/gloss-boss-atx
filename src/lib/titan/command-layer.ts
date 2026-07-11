import type { SupabaseClient } from '@supabase/supabase-js';
import { loadTitanIntelligence } from '@/lib/titan';
import { loadLeadRadar } from '@/lib/titan/lead-radar';
import { loadAdAttribution } from '@/lib/titan/ad-os';
import { loadContentEngine } from '@/lib/titan/content-engine';
import { runFollowUpEngine } from '@/lib/follow-up-engine';
import { executeProspectOutreach } from '@/lib/titan/outreach-os';
import { logTitanActivity } from '@/lib/titan/activity-feed';

export type CommandAction = {
  id: string;
  type:
    | 'follow_up_leads'
    | 'contact_prospect'
    | 'sync_follow_ups'
    | 'membership_promo'
    | 'review_requests'
    | 'content_boost'
    | 'revenue_leak';
  title: string;
  detail: string;
  count?: number;
  prospectId?: string;
  contentPostId?: string;
  potentialCents: number;
  href?: string;
};

export type CommandPlan = {
  id?: string;
  prompt: string;
  status: 'pending' | 'approved' | 'executed' | 'cancelled';
  potentialRevenueCents: number;
  actions: CommandAction[];
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function parseCustomerGoal(prompt: string): number {
  const m = prompt.match(/(\d+)\s*new\s*customer/i);
  if (m) return Math.max(1, Number(m[1]));
  if (/more customer|grow|revenue/i.test(prompt)) return 5;
  return 5;
}

export async function buildCommandPlan(admin: SupabaseClient, prompt: string): Promise<CommandPlan> {
  const targetCustomers = parseCustomerGoal(prompt);
  const [intel, radar] = await Promise.all([
    loadTitanIntelligence(admin),
    loadLeadRadar(admin),
  ]);

  const avgJob = 18000;
  const actions: CommandAction[] = [];
  let potential = 0;

  const followUpCount = Math.min(12, intel.revenueLeaks.find((l) => l.id === 'lapsed-90')?.count ?? intel.opportunities.length);
  if (followUpCount > 0) {
    const cents = followUpCount * avgJob;
    potential += cents;
    actions.push({
      id: 'sync-follow-ups',
      type: 'sync_follow_ups',
      title: `Sync & send ${followUpCount} follow-up messages`,
      detail: 'Recover lapsed customers and high-probability rebooks automatically.',
      count: followUpCount,
      potentialCents: cents,
      href: '/admin/follow-ups',
    });
  }

  const openLeads = await admin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .in('status', ['new', 'contacted', 'quoted', 'no_response']);
  const leadCount = Math.min(targetCustomers + 3, openLeads.count ?? 0);
  if (leadCount > 0) {
    const cents = leadCount * avgJob * 0.35;
    potential += cents;
    actions.push({
      id: 'follow-up-leads',
      type: 'follow_up_leads',
      title: `Follow up with ${leadCount} open leads`,
      detail: 'Move quoted and contacted leads toward booking.',
      count: leadCount,
      potentialCents: cents,
      href: '/admin/leads',
    });
  }

  const topProspects = radar.prospects.filter((p) => p.score >= 75).slice(0, 2);
  for (const p of topProspects) {
    potential += p.estimatedMonthlyCents * 0.15;
    actions.push({
      id: `prospect-${p.id}`,
      type: 'contact_prospect',
      title: `Contact ${p.companyName}`,
      detail: `${p.scoreReason ?? 'High-score B2B prospect'} · est. ${(p.estimatedMonthlyCents / 100).toFixed(0)}/mo`,
      prospectId: p.id,
      potentialCents: Math.round(p.estimatedMonthlyCents * 0.15),
      href: '/admin/titan/opportunities',
    });
  }

  return {
    prompt,
    status: 'pending',
    potentialRevenueCents: potential,
    actions: actions.slice(0, 8),
  };
}

export async function saveCommandPlan(admin: SupabaseClient, plan: CommandPlan, userId: string) {
  const probe = await admin.from('titan_command_plans').select('id').limit(1);
  if (probe.error) return { ok: false as const, error: 'Apply migration 000088' };

  const { data, error } = await admin
    .from('titan_command_plans')
    .insert({
      prompt: plan.prompt,
      status: 'pending',
      potential_revenue_cents: plan.potentialRevenueCents,
      actions: plan.actions,
      created_by: userId,
    })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, planId: str(data?.id) };
}

export async function executeCommandPlan(admin: SupabaseClient, planId: string): Promise<{
  ok: boolean;
  log: string[];
  error?: string;
}> {
  const { data: row } = await admin.from('titan_command_plans').select('*').eq('id', planId).maybeSingle();
  if (!row) return { ok: false, log: [], error: 'Plan not found' };

  const actions = (row.actions as CommandAction[]) ?? [];
  const log: string[] = [];
  const now = new Date().toISOString();

  for (const action of actions) {
    try {
      if (action.type === 'sync_follow_ups') {
        const res = await runFollowUpEngine(admin);
        if ('tablesMissing' in res) log.push('Follow-up engine: migration required');
        else log.push(`Follow-ups: +${res.enqueued} queued, ${res.sent} sent`);
      } else if (action.type === 'contact_prospect' && action.prospectId) {
        const channel = 'email';
        const res = await executeProspectOutreach(admin, action.prospectId, channel);
        log.push(res.ok ? `Contacted prospect ${action.prospectId}` : `Prospect failed: ${res.error}`);
      } else if (action.type === 'follow_up_leads') {
        const { data: leads } = await admin
          .from('leads')
          .select('id, email, phone, name')
          .in('status', ['new', 'contacted', 'quoted'])
          .limit(action.count ?? 5);
        const { sendAdHocFollowUp } = await import('@/lib/follow-up-engine');
        let sent = 0;
        for (const l of leads ?? []) {
          const lead = l as Record<string, unknown>;
          const res = await sendAdHocFollowUp(admin, {
            email: str(lead.email) || undefined,
            phone: str(lead.phone) || undefined,
            customerName: str(lead.name),
          });
          if (res.ok) sent += 1;
        }
        log.push(`Lead follow-ups sent: ${sent}`);
      } else {
        throw new Error(`Unsupported command action was blocked: ${action.type}`);
      }
    } catch (e) {
      log.push(`Error on ${action.title}: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }

  await admin
    .from('titan_command_plans')
    .update({ status: 'executed', executed_at: now, execution_log: log, approved_at: now })
    .eq('id', planId);

  await logTitanActivity(admin, {
    kind: 'command_executed',
    title: 'Growth plan executed',
    detail: log.slice(0, 3).join(' · ') || 'Actions completed',
    href: '/admin/super',
  });

  return { ok: true, log };
}

export async function loadTitanGrowth(admin: SupabaseClient) {
  const [radar, attribution, content] = await Promise.all([
    loadLeadRadar(admin),
    loadAdAttribution(admin),
    loadContentEngine(admin),
  ]);
  return { radar, attribution, content };
}

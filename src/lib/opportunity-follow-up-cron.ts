import type { SupabaseClient } from '@supabase/supabase-js';
import { appendSmsCompliance } from '@/lib/customer-notification-cadence';
import {
  buildOpportunityScripts,
  nextOpportunityFollowUpDate,
  OPPORTUNITY_FOLLOW_UP_DAYS,
  OPPORTUNITY_SNOOZE_DAYS,
} from '@/lib/opportunity-pipeline-scripts';
import { sendCustomerSms } from '@/lib/sms-send';
import type { RevenueOpportunity } from '@/lib/titan/revenue-opportunities';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function rowToOpportunity(row: Record<string, unknown>): RevenueOpportunity {
  return {
    id: str(row.id),
    title: str(row.title) || 'Opportunity',
    opportunityType: str(row.opportunity_type) || 'manual_prospect',
    source: str(row.source_label_custom) || str(row.source_label) || 'Manual',
    estimatedRevenueCents: Number(row.value_cents ?? 0) || 0,
    confidenceScore: Number(row.confidence_score ?? 50) || 50,
    status: str(row.status) as RevenueOpportunity['status'],
    recommendedAction: str(row.recommended_action) || 'Follow up',
    contactName: str(row.author_name) || null,
    contactPhone: str(row.contact_phone) || null,
    contactEmail: str(row.contact_email) || null,
    socialUrl: str(row.source_url) || null,
    notes: str(row.notes) || null,
    whySurfaced: str(row.why_surfaced) || '',
    recommendedMessage: str(row.suggested_reply) || str(row.suggested_dm) || '',
    createdAt: str(row.created_at) || new Date().toISOString(),
    lastTouchedAt: str(row.last_touched_at) || null,
    nextFollowUpAt: str(row.next_follow_up_at) || null,
    workspaceKey: str(row.workspace_key) || 'default',
  };
}

const ACTIVE_STATUSES = new Set(['new', 'seeded', 'contacted', 'follow_up', 'quoted']);

export async function processOpportunityFollowUps(admin: SupabaseClient): Promise<{
  sent: number;
  skipped: number;
  failed: number;
}> {
  const now = new Date();
  const nowIso = now.toISOString();

  const { data, error } = await admin
    .from('titan_opportunities')
    .select('*')
    .eq('follow_up_cadence_paused', false)
    .limit(50);

  if (error) return { sent: 0, skipped: 0, failed: 0 };

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const status = str(row.status);
    if (!ACTIVE_STATUSES.has(status)) {
      skipped++;
      continue;
    }

    const snoozedUntil = str(row.snoozed_until);
    if (snoozedUntil && Date.parse(snoozedUntil) > now.getTime()) {
      skipped++;
      continue;
    }

    const step = Number(row.follow_up_step ?? 0) || 0;
    if (step >= OPPORTUNITY_FOLLOW_UP_DAYS.length) {
      skipped++;
      continue;
    }

    const nextAt = str(row.next_follow_up_at);
    if (nextAt && Date.parse(nextAt) > now.getTime()) {
      skipped++;
      continue;
    }

    const opp = rowToOpportunity(row);
    const scripts = buildOpportunityScripts(opp);
    const scriptKey = step === 0 ? 'sms_pitch' : 'follow_up_no_response';
    const body = scripts[scriptKey];
    const phone = str(opp.contactPhone);

    if (!phone) {
      const createdAt = new Date(str(row.created_at) || nowIso);
      const nextStep = step + 1;
      const nextDate = nextOpportunityFollowUpDate(nextStep, createdAt);
      await admin
        .from('titan_opportunities')
        .update({
          follow_up_step: nextStep,
          next_follow_up_at: nextDate?.toISOString() ?? null,
          updated_at: nowIso,
        })
        .eq('id', opp.id);
      skipped++;
      continue;
    }

    const { data: dup } = await admin
      .from('scheduled_messages')
      .select('id')
      .eq('opportunity_id', opp.id)
      .eq('rule_key', 'opportunity_follow_up')
      .gte('created_at', new Date(now.getTime() - 86400000).toISOString())
      .limit(1);
    if ((dup ?? []).length > 0) {
      skipped++;
      continue;
    }

    try {
      const smsBody = appendSmsCompliance(body);
      const smsRes = await sendCustomerSms({
        db: admin,
        kind: 'opportunity_follow_up',
        template_key: 'opportunity_follow_up',
        to: phone,
        body: smsBody,
        extraPayload: { opportunity_id: opp.id, follow_up_step: step },
      });

      if (smsRes.ok) {
        sent++;
        const createdAt = new Date(str(row.created_at) || nowIso);
        const nextStep = step + 1;
        const nextDate = nextOpportunityFollowUpDate(nextStep, createdAt);
        await admin
          .from('titan_opportunities')
          .update({
            follow_up_step: nextStep,
            next_follow_up_at: nextDate?.toISOString() ?? null,
            status: status === 'new' || status === 'seeded' ? 'follow_up' : status,
            last_touched_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', opp.id);
      } else if (smsRes.skipped) {
        skipped++;
      } else {
        failed++;
      }

      if (opp.contactEmail?.includes('@') && step === 0) {
        const { sendResendHtml, resendConfigured } = await import('@/lib/email-send');
        const { glossBossEmailLayout } = await import('@/lib/email/templates/layout');
        if (resendConfigured()) {
          const html = glossBossEmailLayout({
            title: `Gloss Boss ATX — ${opp.title}`,
            bodyHtml: scripts.email_pitch.replace(/\n/g, '<br/>'),
          });
          const emailRes = await sendResendHtml({
            to: opp.contactEmail,
            subject: `Gloss Boss ATX — ${opp.title}`,
            html,
          });
          if (emailRes.ok) sent++;
          else if (!emailRes.ok) failed++;
        }
      }
    } catch {
      failed++;
    }
  }

  return { sent, skipped, failed };
}

export function initialOpportunityFollowUpAt(createdAt = new Date()): string {
  return nextOpportunityFollowUpDate(0, createdAt)?.toISOString() ?? createdAt.toISOString();
}

export function snoozeOpportunityFollowUpUntil(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + OPPORTUNITY_SNOOZE_DAYS);
  return d.toISOString();
}

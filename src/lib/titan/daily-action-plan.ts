import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { displayMoney } from '@/lib/display-format';
import { loadFollowUpDashboard, previewFollowUpMessage } from '@/lib/follow-up-engine';
import { loadRevenueHuntBundle } from '@/lib/titan/revenue-opportunities';
import { loadLeadRadarItems } from '@/lib/titan/lead-radar-engine';
import { resolveGoogleReviewUrl } from '@/lib/site-defaults';
import { workOrderPath } from '@/lib/work-order-links';

export type DailyActionType =
  | 'follow_up'
  | 'review'
  | 'balance'
  | 'referral'
  | 'calendar_slot'
  | 'rebook'
  | 'membership'
  | 'lead'
  | 'message';

export type DailyExecutableAction = {
  id: string;
  actionKey: string;
  actionType: DailyActionType;
  title: string;
  involvedNames: string;
  expectedValueCents: number;
  expectedValueLabel: string;
  reason: string;
  confidence: number;
  confidenceLabel: string;
  messageScript: string;
  contactPhone: string | null;
  contactEmail: string | null;
  entityType?: string;
  entityId?: string;
  href: string;
  status: 'pending' | 'sent' | 'dismissed' | 'completed';
  canSend: boolean;
  sendBlocker?: string;
};

export type DailyActionPlan = {
  actions: DailyExecutableAction[];
  fastestMoneyMoves: DailyExecutableAction[];
};

function todayChicago(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function valueLabel(cents: number): string {
  if (cents <= 0) return 'Protects reputation';
  return `Up to ${displayMoney(cents)}`;
}

type DraftAction = Omit<DailyExecutableAction, 'id' | 'status'>;

export async function buildDailyActionPlan(admin: SupabaseClient, avgJobCents = 17500): Promise<DailyActionPlan> {
  const drafts: DraftAction[] = [];
  const reviewUrl = resolveGoogleReviewUrl('');
  const bookUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '')}/book`;

  const [followUps, revenueHunt, leadRadar, completedJobs, unpaidJobs, rebookRows, membershipCandidates] =
    await Promise.all([
      loadFollowUpDashboard(admin).catch(() => null),
      loadRevenueHuntBundle(admin).catch(() => ({ opportunities: [] as never[] })),
      loadLeadRadarItems(admin).catch(() => ({ items: [] as never[] })),
      admin
        .from('titan_job_closeouts')
        .select('id, appointment_id, review_requested_at, appointments(guest_name, guest_phone, guest_email)')
        .is('review_requested_at', null)
        .order('created_at', { ascending: false })
        .limit(5),
      admin
        .from('appointments')
        .select('id, guest_name, guest_phone, guest_email, balance_due_cents')
        .gt('balance_due_cents', 0)
        .not('status', 'eq', 'cancelled')
        .order('scheduled_start', { ascending: false })
        .limit(5),
      admin
        .from('appointments')
        .select('id, guest_name, guest_phone, guest_email, completed_at')
        .eq('status', 'completed')
        .lte('completed_at', new Date(Date.now() - 60 * 86400000).toISOString())
        .gte('completed_at', new Date(Date.now() - 120 * 86400000).toISOString())
        .order('completed_at', { ascending: true })
        .limit(5),
      admin.from('customers').select('id, full_name, email, phone').order('updated_at', { ascending: false }).limit(8),
    ]);

  const dueFollowUps = (followUps?.queue ?? []).filter((f) => f.status === 'pending').slice(0, 3);
  if (dueFollowUps.length > 0) {
    const names = dueFollowUps.map((f) => f.customerName ?? 'Customer').join(', ');
    const first = dueFollowUps[0]!;
    let script = `Hi ${first.customerName ?? 'there'} — Gloss Boss ATX checking in. Ready to book your next detail? ${bookUrl}`;
    try {
      const preview = await previewFollowUpMessage(admin, first.id);
      if (preview?.body) script = preview.body;
    } catch {
      /* default script */
    }
    drafts.push({
      actionKey: `followup-batch-${todayChicago()}`,
      actionType: 'follow_up',
      title: `Follow up with ${dueFollowUps.length} past customer${dueFollowUps.length === 1 ? '' : 's'}`,
      involvedNames: names,
      expectedValueCents: avgJobCents * dueFollowUps.length,
      expectedValueLabel: valueLabel(avgJobCents * dueFollowUps.length),
      reason: 'Win-back texts to customers due for another detail.',
      confidence: 72,
      confidenceLabel: 'Based on follow-up tier timing',
      messageScript: script,
      contactPhone: first.customerPhone,
      contactEmail: first.customerEmail,
      entityType: 'follow_up',
      entityId: first.id,
      href: '/admin/follow-ups',
      canSend: Boolean(first.customerPhone),
    });
  }

  for (const row of (completedJobs.data ?? []).slice(0, 2)) {
    const closeout = row as Record<string, unknown>;
    const appt = (closeout.appointments as Record<string, unknown> | null) ?? {};
    const apptId = str(closeout.appointment_id);
    const name = str(appt.guest_name) || 'Customer';
    drafts.push({
      actionKey: `review-${apptId}`,
      actionType: 'review',
      title: `Text ${name} for Google review`,
      involvedNames: name,
      expectedValueCents: 0,
      expectedValueLabel: 'Social proof → more bookings',
      reason: 'Completed detail with no review request sent yet.',
      confidence: 88,
      confidenceLabel: 'Post-service reviews convert well',
      messageScript: `Gloss Boss ATX — Thanks ${name}! We'd love your Google review: ${reviewUrl}`,
      contactPhone: str(appt.guest_phone) || null,
      contactEmail: str(appt.guest_email) || null,
      entityType: 'appointment',
      entityId: apptId,
      href: workOrderPath(apptId, { source: 'appointment', shell: 'admin' }),
      canSend: Boolean(appt.guest_phone || appt.guest_email),
    });
  }

  const unpaid = unpaidJobs.data ?? [];
  for (const job of unpaid) {
    const balance = Number(job.balance_due_cents ?? 0);
    const name = str(job.guest_name) || 'Customer';
    const phone = str(job.guest_phone) || null;
    const email = str(job.guest_email) || null;
    drafts.push({
      actionKey: `balance-${job.id}`,
      actionType: 'balance',
      title: `Balance reminder — ${name} (${displayMoney(balance)})`,
      involvedNames: name,
      expectedValueCents: balance,
      expectedValueLabel: valueLabel(balance),
      reason: 'Outstanding balance blocks clean books and cash flow.',
      confidence: 91,
      confidenceLabel: 'Direct payment recovery',
      messageScript: `Hi ${name} — Gloss Boss ATX balance of ${displayMoney(balance)} is due. Reply when ready. Thank you!`,
      contactPhone: phone,
      contactEmail: email,
      entityType: 'appointment',
      entityId: str(job.id),
      href: workOrderPath(str(job.id), { source: 'appointment', shell: 'admin' }),
      canSend: Boolean(phone || email),
      sendBlocker: !phone && !email ? 'No phone or email on file.' : !phone ? 'SMS unavailable — email only.' : undefined,
    });
  }

  const warmOpp = revenueHunt.opportunities?.find((o) => o.status === 'new' || o.status === 'follow_up');
  if (warmOpp) {
    drafts.push({
      actionKey: `opp-${warmOpp.id}`,
      actionType: 'lead',
      title: warmOpp.title,
      involvedNames: warmOpp.contactName ?? 'Lead',
      expectedValueCents: warmOpp.estimatedRevenueCents || avgJobCents,
      expectedValueLabel: valueLabel(warmOpp.estimatedRevenueCents || avgJobCents),
      reason: warmOpp.whySurfaced || 'Warm revenue opportunity ready for outreach.',
      confidence: warmOpp.confidenceScore,
      confidenceLabel: 'Titan revenue hunt',
      messageScript: warmOpp.recommendedMessage,
      contactPhone: warmOpp.contactPhone,
      contactEmail: warmOpp.contactEmail,
      entityType: 'opportunity',
      entityId: warmOpp.id,
      href: '/admin/titan/opportunities',
      canSend: Boolean(warmOpp.contactPhone),
    });
  }

  const socialLead = leadRadar.items?.find((l) => l.status === 'new' || l.status === 'reviewed');
  if (socialLead) {
    drafts.push({
      actionKey: `radar-${socialLead.id}`,
      actionType: 'referral',
      title: `Contact referral candidate — ${socialLead.contactName ?? socialLead.authorName ?? 'Lead'}`,
      involvedNames: socialLead.contactName ?? socialLead.authorName ?? 'Lead',
      expectedValueCents: avgJobCents,
      expectedValueLabel: valueLabel(avgJobCents),
      reason: socialLead.whyTitanFlagged || 'Social intent or referral opportunity.',
      confidence: socialLead.confidenceScore ?? 60,
      confidenceLabel: 'Lead radar signal',
      messageScript: socialLead.recommendedReply ?? `Hi! Gloss Boss ATX mobile detail — book: ${bookUrl}`,
      contactPhone: socialLead.phone ?? null,
      contactEmail: socialLead.email ?? null,
      entityType: 'lead_radar',
      entityId: socialLead.id,
      href: '/admin/titan/lead-radar',
      canSend: Boolean(socialLead.phone),
    });
  }

  const rebooks = rebookRows.data ?? [];
  if (rebooks.length > 0) {
    const first = rebooks[0]!;
    drafts.push({
      actionKey: `rebook-${first.id}`,
      actionType: 'rebook',
      title: `Rebook ${rebooks.length} customer${rebooks.length === 1 ? '' : 's'} due for service`,
      involvedNames: rebooks
        .map((r) => str(r.guest_name))
        .filter(Boolean)
        .slice(0, 3)
        .join(', '),
      expectedValueCents: avgJobCents * Math.min(rebooks.length, 3),
      expectedValueLabel: valueLabel(avgJobCents * Math.min(rebooks.length, 3)),
      reason: '60–120 days since last detail — ideal maintenance window.',
      confidence: 78,
      confidenceLabel: 'Repeat customer timing',
      messageScript: `Hi ${str(first.guest_name) || 'there'} — time for your next Gloss Boss detail? ${bookUrl}`,
      contactPhone: str(first.guest_phone) || null,
      contactEmail: str(first.guest_email) || null,
      entityType: 'appointment',
      entityId: str(first.id),
      href: '/admin/customers',
      canSend: Boolean(first.guest_phone),
    });
  }

  const members = membershipCandidates.data ?? [];
  if (members.length > 0) {
    const first = members[0]!;
    drafts.push({
      actionKey: `membership-${first.id}`,
      actionType: 'membership',
      title: `Membership upsell — ${str(first.full_name) || 'Repeat client'}`,
      involvedNames: members
        .map((m) => str(m.full_name))
        .filter(Boolean)
        .slice(0, 3)
        .join(', '),
      expectedValueCents: Math.round(avgJobCents * 0.15 * 4),
      expectedValueLabel: 'Recurring care + priority',
      reason: 'Multiple visits without a membership plan.',
      confidence: 65,
      confidenceLabel: 'Repeat visit pattern',
      messageScript: `Hi ${str(first.full_name) || 'there'} — Gloss Boss memberships save on every detail. ${bookUrl.replace('/book', '/memberships')}`,
      contactPhone: str(first.phone) || null,
      contactEmail: str(first.email) || null,
      entityType: 'customer',
      entityId: str(first.id),
      href: `/admin/customers/${first.id}`,
      canSend: Boolean(first.phone || first.email),
    });
  }

  drafts.push({
    actionKey: `calendar-open-${todayChicago()}`,
    actionType: 'calendar_slot',
    title: 'Promote open calendar slots',
    involvedNames: 'Warm leads & past clients',
    expectedValueCents: avgJobCents,
    expectedValueLabel: valueLabel(avgJobCents),
    reason: 'Fill empty route capacity this week.',
    confidence: 70,
    confidenceLabel: 'Open dispatch slots',
    messageScript: `Gloss Boss ATX has openings this week. Book: ${bookUrl}`,
    contactPhone: null,
    contactEmail: null,
    href: '/admin/dispatch',
    canSend: false,
  });

  const actionDate = todayChicago();
  const probe = await admin.from('titan_daily_actions').select('id').limit(1);
  if (!probe.error) {
    for (const d of drafts) {
      await admin.from('titan_daily_actions').upsert(
        {
          action_date: actionDate,
          action_key: d.actionKey,
          action_type: d.actionType,
          title: d.title,
          involved_names: d.involvedNames,
          reason: d.reason,
          expected_value_cents: d.expectedValueCents,
          confidence_score: d.confidence,
          confidence_label: d.confidenceLabel,
          message_script: d.messageScript,
          contact_phone: d.contactPhone,
          contact_email: d.contactEmail,
          entity_type: d.entityType ?? null,
          entity_id: d.entityId ?? null,
          href: d.href,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'action_date,action_key' },
      );
    }

    const { data: rows } = await admin
      .from('titan_daily_actions')
      .select('*')
      .eq('action_date', actionDate)
      .neq('status', 'dismissed')
      .order('expected_value_cents', { ascending: false });

    const actions: DailyExecutableAction[] = (rows ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const cents = Number(row.expected_value_cents ?? 0);
      return {
        id: str(row.id),
        actionKey: str(row.action_key),
        actionType: str(row.action_type) as DailyActionType,
        title: str(row.title),
        involvedNames: str(row.involved_names),
        expectedValueCents: cents,
        expectedValueLabel: valueLabel(cents),
        reason: str(row.reason),
        confidence: Number(row.confidence_score ?? 70),
        confidenceLabel: str(row.confidence_label) || 'Titan estimate',
        messageScript: str(row.message_script),
        contactPhone: str(row.contact_phone) || null,
        contactEmail: str(row.contact_email) || null,
        entityType: str(row.entity_type) || undefined,
        entityId: str(row.entity_id) || undefined,
        href: str(row.href) || '/admin',
        status: str(row.status) as DailyExecutableAction['status'],
        canSend: Boolean(row.contact_phone || row.contact_email),
      };
    });

    const pending = actions.filter((a) => a.status === 'pending');
    return {
      actions: pending.slice(0, 8),
      fastestMoneyMoves: pending.filter((a) => a.expectedValueCents > 0).slice(0, 3),
    };
  }

  const fallback = drafts.map((d, i) => ({ ...d, id: `draft-${i}`, status: 'pending' as const }));
  return {
    actions: fallback.slice(0, 8),
    fastestMoneyMoves: fallback.filter((a) => a.expectedValueCents > 0).slice(0, 3),
  };
}

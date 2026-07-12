import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { displayMoney } from '@/lib/display-format';
import { loadFollowUpDashboard, previewFollowUpMessage } from '@/lib/follow-up-engine';
import { loadRevenueHuntBundle } from '@/lib/titan/revenue-opportunities';
import { loadLeadRadarItems } from '@/lib/titan/lead-radar-engine';
import { resolveGoogleReviewUrl } from '@/lib/site-defaults';
import { workOrderPath } from '@/lib/work-order-links';
import { buildContextualMessage } from '@/lib/titan/contextual-messages';
import { createCustomerFinalBalanceCheckoutSession } from '@/lib/stripe/checkout';
import { buildTrackedBalancePayUrl } from '@/lib/payment-link-tracking';
import { recommendMembershipTier } from '@/lib/membership-roi';

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
  /** Plain-English why this dollar amount was chosen. */
  valueExplanation: string;
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
  /** True when this pending row was generated on a prior Chicago date. */
  carriedOver?: boolean;
  actionDate?: string;
};

export type DailyActionPlan = {
  actions: DailyExecutableAction[];
  fastestMoneyMoves: DailyExecutableAction[];
  lastGeneratedAt: string | null;
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

function avgTicketExplanation(avgJobCents: number, multiplier = 1): string {
  const base = `Uses your ~${displayMoney(avgJobCents)} average ticket`;
  return multiplier > 1 ? `${base} × ${multiplier} contacts` : base;
}

type DraftAction = Omit<DailyExecutableAction, 'id' | 'status'>;

export async function buildDailyActionPlan(admin: SupabaseClient, avgJobCents = 17500): Promise<DailyActionPlan> {
  const safeAvg = Math.max(avgJobCents, 12000);
  const drafts: DraftAction[] = [];
  const reviewUrl = resolveGoogleReviewUrl('');
  const bookUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '')}/book`;

  const actionDate = todayChicago();
  // Include recent dismissals so refresh does not resurrect the same action keys.
  const lookback = new Date();
  lookback.setDate(lookback.getDate() - 14);
  const lookbackIso = lookback.toISOString().slice(0, 10);
  const { data: closedRows } = await admin
    .from('titan_daily_actions')
    .select('action_key, status, action_date')
    .gte('action_date', lookbackIso)
    .in('status', ['dismissed', 'sent', 'completed']);
  const closedKeys = new Set((closedRows ?? []).map((r) => str((r as { action_key?: string }).action_key)).filter(Boolean));

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
        .select('id, guest_name, guest_phone, guest_email, balance_due_cents, access_token, vehicle_description')
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
      expectedValueCents: safeAvg * dueFollowUps.length,
      expectedValueLabel: valueLabel(safeAvg * dueFollowUps.length),
      valueExplanation: avgTicketExplanation(safeAvg, dueFollowUps.length),
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
      valueExplanation: 'No direct $ — reviews drive future bookings.',
      reason: 'Completed detail with no review request sent yet.',
      confidence: 88,
      confidenceLabel: 'Post-service reviews convert well',
      messageScript: buildContextualMessage('review', {
        customerName: name,
        vehicle: str(appt.vehicle_description) || null,
        service: str(appt.service_slug) || null,
        reviewUrl,
      }),
      contactPhone: str(appt.guest_phone) || null,
      contactEmail: str(appt.guest_email) || null,
      entityType: 'appointment',
      entityId: apptId,
      href: workOrderPath(apptId, { source: 'appointment', shell: 'admin' }),
      canSend: Boolean(appt.guest_phone || appt.guest_email),
    });
  }

  const unpaid = unpaidJobs.data ?? [];
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
  for (const job of unpaid) {
    const balance = Number(job.balance_due_cents ?? 0);
    const name = str(job.guest_name) || 'Customer';
    const phone = str(job.guest_phone) || null;
    const email = str(job.guest_email) || null;
    const apptId = str(job.id);
    const accessToken = str((job as { access_token?: string }).access_token);
    let paymentUrl: string | null = null;
    try {
      const checkout = await createCustomerFinalBalanceCheckoutSession({ admin, appointmentId: apptId, origin });
      if (checkout.ok && 'url' in checkout && checkout.url) {
        paymentUrl = accessToken ? buildTrackedBalancePayUrl(origin, apptId, accessToken) : checkout.url;
      }
    } catch {
      /* stripe optional */
    }
    drafts.push({
      actionKey: `balance-${job.id}`,
      actionType: 'balance',
      title: `Balance reminder — ${name} (${displayMoney(balance)})`,
      involvedNames: name,
      expectedValueCents: balance,
      expectedValueLabel: valueLabel(balance),
      valueExplanation: `Exact balance due on work order (${displayMoney(balance)}).`,
      reason: paymentUrl
        ? 'Stripe pay link ready — one tap to collect.'
        : 'Outstanding balance blocks clean books and cash flow.',
      confidence: paymentUrl ? 95 : 91,
      confidenceLabel: paymentUrl ? 'Secure payment link generated' : 'Direct payment recovery',
      messageScript: buildContextualMessage('balance', {
        customerName: name,
        balanceCents: balance,
        paymentUrl,
        vehicle: str((job as { vehicle_description?: string }).vehicle_description) || null,
      }),
      contactPhone: phone,
      contactEmail: email,
      entityType: 'appointment',
      entityId: apptId,
      href: workOrderPath(apptId, { source: 'appointment', shell: 'admin' }),
      canSend: Boolean(phone || email),
      sendBlocker: !phone && !email ? 'No phone or email on file.' : !phone ? 'SMS unavailable — email only.' : undefined,
    });
  }

  const warmOpp = revenueHunt.opportunities?.find((o) => o.status === 'new' || o.status === 'follow_up');
  if (warmOpp) {
    const oppCents = warmOpp.estimatedRevenueCents || safeAvg;
    drafts.push({
      actionKey: `opp-${warmOpp.id}`,
      actionType: 'lead',
      title: warmOpp.title,
      involvedNames: warmOpp.contactName ?? 'Lead',
      expectedValueCents: oppCents,
      expectedValueLabel: valueLabel(oppCents),
      valueExplanation: warmOpp.estimatedRevenueCents
        ? 'Opportunity estimate from CRM / discovery.'
        : avgTicketExplanation(safeAvg),
      reason: warmOpp.whySurfaced || 'Warm revenue opportunity ready for outreach.',
      confidence: warmOpp.confidenceScore,
      confidenceLabel: 'Titan revenue hunt',
      messageScript: warmOpp.recommendedMessage,
      contactPhone: warmOpp.contactPhone,
      contactEmail: warmOpp.contactEmail,
      entityType: 'opportunity',
      entityId: warmOpp.id,
      href: `/admin/titan/opportunities?open=${encodeURIComponent(warmOpp.id)}`,
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
      expectedValueCents: safeAvg,
      expectedValueLabel: valueLabel(safeAvg),
      valueExplanation: avgTicketExplanation(safeAvg),
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
    const rebookCount = Math.min(rebooks.length, 3);
    drafts.push({
      actionKey: `rebook-${first.id}`,
      actionType: 'rebook',
      title: `Rebook ${rebooks.length} customer${rebooks.length === 1 ? '' : 's'} due for service`,
      involvedNames: rebooks
        .map((r) => str(r.guest_name))
        .filter(Boolean)
        .slice(0, 3)
        .join(', '),
      expectedValueCents: safeAvg * rebookCount,
      expectedValueLabel: valueLabel(safeAvg * rebookCount),
      valueExplanation: avgTicketExplanation(safeAvg, rebookCount),
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
    const memberName = str(first.full_name) || 'Repeat client';
    const { data: memberAppts } = await admin
      .from('appointments')
      .select('base_price_cents, completed_at, vehicle_description')
      .eq('customer_id', str(first.id))
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(12);
    const completedMember = memberAppts ?? [];
    const visitCount = completedMember.length;
    const avgTicket =
      visitCount > 0
        ? Math.round(completedMember.reduce((s, a) => s + (Number(a.base_price_cents) || 0), 0) / visitCount)
        : safeAvg;
    const roi = recommendMembershipTier(Math.max(visitCount, 2), avgTicket / 100);
    const membershipCents = Math.round(roi.best.netSavings * 100) || Math.round(safeAvg * 0.15 * 4);
    drafts.push({
      actionKey: `membership-${first.id}`,
      actionType: 'membership',
      title: `Membership upsell — ${memberName}`,
      involvedNames: members
        .map((m) => str(m.full_name))
        .filter(Boolean)
        .slice(0, 3)
        .join(', '),
      expectedValueCents: membershipCents,
      expectedValueLabel: `Recommend ${roi.best.meta.tier.toUpperCase()}`,
      valueExplanation: `Projected annual membership value from ${visitCount} visits @ ${displayMoney(avgTicket)} avg.`,
      reason: roi.explanation,
      confidence: Math.min(95, 60 + visitCount * 8),
      confidenceLabel: `${visitCount} visits · avg ${displayMoney(avgTicket)}`,
      messageScript: buildContextualMessage('membership', {
        customerName: memberName,
        vehicle: str(completedMember[0]?.vehicle_description) || null,
        visitCount,
        avgTicketCents: avgTicket,
        recommendedTier: roi.best.meta.tier.toUpperCase(),
        projectedAnnualSavingsCents: Math.max(0, Math.round(roi.best.netSavings * 100)),
        bookUrl: bookUrl.replace('/book', '/memberships'),
      }),
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
    expectedValueCents: safeAvg,
    expectedValueLabel: valueLabel(safeAvg),
    valueExplanation: avgTicketExplanation(safeAvg),
    reason: 'Fill empty route capacity this week.',
    confidence: 70,
    confidenceLabel: 'Open dispatch slots',
    messageScript: `Gloss Boss ATX has openings this week. Book: ${bookUrl}`,
    contactPhone: null,
    contactEmail: null,
    href: '/admin/calendar',
    canSend: false,
  });

  const openDrafts = drafts.filter((d) => !closedKeys.has(d.actionKey));
  const probe = await admin.from('titan_daily_actions').select('id').limit(1);
  if (!probe.error) {
    for (const d of openDrafts) {
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
      .eq('status', 'pending')
      .order('expected_value_cents', { ascending: false });

    const actions: DailyExecutableAction[] = (rows ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const cents = Number(row.expected_value_cents ?? 0);
      const draftMatch = openDrafts.find((d) => d.actionKey === str(row.action_key));
      const rowDate = str(row.action_date) || actionDate;
      return {
        id: str(row.id),
        actionKey: str(row.action_key),
        actionType: str(row.action_type) as DailyActionType,
        title: str(row.title),
        involvedNames: str(row.involved_names),
        expectedValueCents: cents,
        expectedValueLabel: valueLabel(cents),
        valueExplanation: draftMatch?.valueExplanation || (cents > 0 ? avgTicketExplanation(safeAvg) : 'No direct dollar value'),
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
        actionDate: rowDate,
        carriedOver: rowDate < actionDate,
      };
    });

    // Carry forward still-pending actions from prior days (same action_key not closed).
    const { data: carryRows } = await admin
      .from('titan_daily_actions')
      .select('*')
      .lt('action_date', actionDate)
      .gte('action_date', lookbackIso)
      .eq('status', 'pending')
      .order('expected_value_cents', { ascending: false })
      .limit(8);

    const seenKeys = new Set(actions.map((a) => a.actionKey));
    for (const r of carryRows ?? []) {
      const row = r as Record<string, unknown>;
      const key = str(row.action_key);
      if (!key || seenKeys.has(key) || closedKeys.has(key)) continue;
      seenKeys.add(key);
      const cents = Number(row.expected_value_cents ?? 0);
      const rowDate = str(row.action_date) || actionDate;
      actions.push({
        id: str(row.id),
        actionKey: key,
        actionType: str(row.action_type) as DailyActionType,
        title: str(row.title),
        involvedNames: str(row.involved_names),
        expectedValueCents: cents,
        expectedValueLabel: valueLabel(cents),
        valueExplanation: cents > 0 ? avgTicketExplanation(safeAvg) : 'No direct dollar value',
        reason: str(row.reason),
        confidence: Number(row.confidence_score ?? 70),
        confidenceLabel: str(row.confidence_label) || 'Titan estimate',
        messageScript: str(row.message_script),
        contactPhone: str(row.contact_phone) || null,
        contactEmail: str(row.contact_email) || null,
        entityType: str(row.entity_type) || undefined,
        entityId: str(row.entity_id) || undefined,
        href: str(row.href) || '/admin',
        status: 'pending',
        canSend: Boolean(row.contact_phone || row.contact_email),
        actionDate: rowDate,
        carriedOver: true,
      });
    }

    actions.sort((a, b) => b.expectedValueCents - a.expectedValueCents);

    const lastGeneratedAt =
      (rows ?? []).reduce<string | null>((max, r) => {
        const u = str((r as { updated_at?: string }).updated_at);
        if (!u) return max;
        if (!max || u > max) return u;
        return max;
      }, null) ?? new Date().toISOString();

    return {
      actions: actions.slice(0, 8),
      fastestMoneyMoves: actions.filter((a) => a.expectedValueCents > 0).slice(0, 3),
      lastGeneratedAt,
    };
  }

  const fallback = openDrafts.map((d, i) => ({ ...d, id: `draft-${i}`, status: 'pending' as const, actionDate, carriedOver: false }));
  return {
    actions: fallback.slice(0, 8),
    fastestMoneyMoves: fallback.filter((a) => a.expectedValueCents > 0).slice(0, 3),
    lastGeneratedAt: new Date().toISOString(),
  };
}

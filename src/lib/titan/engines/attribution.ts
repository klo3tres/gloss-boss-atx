import type { SupabaseClient } from '@supabase/supabase-js';

export type AttributionProof = {
  id: string;
  actionType: string;
  actionLabel: string;
  attributedRevenueCents: number;
  matchMethod: string;
  leadId: string | null;
  appointmentId: string | null;
  paymentId: string | null;
  createdAt: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function normalizePhone(p: string): string {
  return p.replace(/\D/g, '').slice(-10);
}

function findMatchingMission(
  missions: unknown[],
  phone: string,
  email: string,
  eventAt: number,
): Record<string, unknown> | null {
  let best: Record<string, unknown> | null = null;
  let bestDelta = Infinity;

  for (const m of missions) {
    const row = m as Record<string, unknown>;
    const created = new Date(str(row.created_at)).getTime();
    const delta = eventAt - created;
    if (delta < 0 || delta > 14 * 86400000) continue;

    const outreach = row.outreach_json as { sms?: string } | null;
    const sms = outreach?.sms ?? '';
    if (phone && sms.includes(phone.slice(-4))) return row;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = row;
    }
  }

  return bestDelta < 7 * 86400000 ? best : null;
}

async function linkPayments(admin: SupabaseClient, since: string) {
  const { data: payments } = await admin
    .from('payments')
    .select('id, appointment_id, amount_cents, created_at')
    .gte('created_at', since)
    .eq('status', 'succeeded')
    .limit(100);

  for (const pay of payments ?? []) {
    const p = pay as Record<string, unknown>;
    const paymentId = str(p.id);
    const apptId = str(p.appointment_id);
    if (!apptId) continue;

    const { data: attr } = await admin
      .from('titan_attributions')
      .select('id, action_id')
      .eq('appointment_id', apptId)
      .maybeSingle();
    if (!attr?.id) continue;

    const { data: already } = await admin
      .from('titan_attributions')
      .select('id')
      .eq('payment_id', paymentId)
      .maybeSingle();
    if (already?.id) continue;

    const amount = Number(p.amount_cents ?? 0);
    await admin.from('titan_attributions').insert({
      action_type: 'mission_action',
      action_id: str((attr as { action_id?: string }).action_id),
      appointment_id: apptId,
      payment_id: paymentId,
      attributed_revenue_cents: amount,
      match_method: 'auto_timing',
      notes: 'Payment collected — closed loop',
    });

    await admin
      .from('titan_mission_actions')
      .update({ outcome: 'revenue_collected', attributed_revenue_cents: amount })
      .eq('id', str((attr as { action_id?: string }).action_id));
  }
}

export async function syncAttributions(admin: SupabaseClient): Promise<void> {
  const probe = await admin.from('titan_attributions').select('id').limit(1);
  if (probe.error) return;

  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const [{ data: missions }, { data: leads }, { data: appts }] = await Promise.all([
    admin.from('titan_mission_actions').select('id, title, outreach_json, created_at').gte('created_at', since).limit(50),
    admin
      .from('leads')
      .select('id, name, phone, email, lead_source, created_at')
      .or('lead_source.ilike.%titan%,lead_source.eq.referral,lead_source.eq.fleet_inquiry')
      .gte('created_at', since)
      .limit(100),
    admin
      .from('appointments')
      .select('id, guest_phone, guest_email, marketing_channel, booking_source, base_price_cents, created_at')
      .gte('created_at', since)
      .limit(100),
  ]);

  for (const lead of leads ?? []) {
    const l = lead as Record<string, unknown>;
    const leadId = str(l.id);
    const { data: existing } = await admin.from('titan_attributions').select('id').eq('lead_id', leadId).maybeSingle();
    if (existing?.id) continue;

    const phone = normalizePhone(str(l.phone));
    const email = str(l.email).toLowerCase();
    const leadAt = new Date(str(l.created_at)).getTime();
    const mission = findMatchingMission(missions ?? [], phone, email, leadAt);
    if (mission) {
      await admin.from('titan_attributions').insert({
        action_type: 'mission_action',
        action_id: str(mission.id),
        lead_id: leadId,
        attributed_revenue_cents: 0,
        match_method: phone ? 'auto_phone' : 'auto_timing',
        notes: `Auto-linked lead to mission: ${str(mission.title)}`,
      });
    }
  }

  for (const appt of appts ?? []) {
    const a = appt as Record<string, unknown>;
    const apptId = str(a.id);
    const { data: existing } = await admin.from('titan_attributions').select('id').eq('appointment_id', apptId).maybeSingle();
    if (existing?.id) continue;

    const revenue = Number(a.base_price_cents ?? 0);
    const source = str(a.marketing_channel) || str(a.booking_source);
    if (!/titan|b2b|referral|fleet/i.test(source) && revenue <= 0) continue;

    const phone = normalizePhone(str(a.guest_phone));
    const email = str(a.guest_email).toLowerCase();
    const apptAt = new Date(str(a.created_at)).getTime();
    const mission = findMatchingMission(missions ?? [], phone, email, apptAt);

    if (mission) {
      await admin.from('titan_attributions').insert({
        action_type: 'mission_action',
        action_id: str(mission.id),
        appointment_id: apptId,
        attributed_revenue_cents: revenue,
        match_method: 'auto_timing',
        notes: `Booking linked to: ${str(mission.title)}`,
      });
      await admin
        .from('titan_mission_actions')
        .update({ outcome: 'booked', attributed_revenue_cents: revenue, outcome_at: new Date().toISOString() })
        .eq('id', str(mission.id));
    }
  }

  await linkPayments(admin, since);
}

export async function loadAttributionProof(admin: SupabaseClient): Promise<{
  proofs: AttributionProof[];
  totalAttributedCents: number;
  tablesReady: boolean;
}> {
  const probe = await admin.from('titan_attributions').select('id').limit(1);
  if (probe.error) return { proofs: [], totalAttributedCents: 0, tablesReady: false };

  await syncAttributions(admin);

  const { data } = await admin.from('titan_attributions').select('*').order('created_at', { ascending: false }).limit(15);

  const proofs: AttributionProof[] = [];
  let total = 0;

  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const cents = Number(r.attributed_revenue_cents ?? 0);
    total += cents;

    let actionLabel = str(r.action_id);
    if (str(r.action_type) === 'mission_action') {
      const { data: ma } = await admin.from('titan_mission_actions').select('title').eq('id', str(r.action_id)).maybeSingle();
      actionLabel = str((ma as { title?: string })?.title) || actionLabel;
    }

    proofs.push({
      id: str(r.id),
      actionType: str(r.action_type),
      actionLabel,
      attributedRevenueCents: cents,
      matchMethod: str(r.match_method),
      leadId: str(r.lead_id) || null,
      appointmentId: str(r.appointment_id) || null,
      paymentId: str(r.payment_id) || null,
      createdAt: str(r.created_at),
    });
  }

  return { proofs, totalAttributedCents: total, tablesReady: true };
}

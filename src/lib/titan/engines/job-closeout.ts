import type { SupabaseClient } from '@supabase/supabase-js';
import { buildOutreachForCustomer } from '@/lib/titan/engines/outreach';

export type JobCloseoutItem = {
  id: string;
  appointmentId: string;
  customerName: string;
  completedAt: string;
  status: string;
  reviewRequested: boolean;
  reviewCompleted: boolean;
  referralRequested: boolean;
  referralCompleted: boolean;
  discountOffered: boolean;
  followUpSent: boolean;
  isComplete: boolean;
  nextStep: string;
  outreachSms: string;
  href: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export async function ensureCloseoutsForRecentJobs(admin: SupabaseClient): Promise<void> {
  const probe = await admin.from('titan_job_closeouts').select('id').limit(1);
  if (probe.error) return;

  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: appts } = await admin
    .from('appointments')
    .select('id, guest_name, job_completed_at, updated_at, status')
    .eq('status', 'completed')
    .gte('job_completed_at', since)
    .limit(50);

  for (const row of appts ?? []) {
    const a = row as Record<string, unknown>;
    const apptId = str(a.id);
    const { data: existing } = await admin.from('titan_job_closeouts').select('id').eq('appointment_id', apptId).maybeSingle();
    if (existing?.id) continue;

    await admin.from('titan_job_closeouts').insert({
      appointment_id: apptId,
      status: 'pending',
    });
  }
}

function nextStepFor(closeout: Record<string, unknown>): string {
  if (!closeout.review_requested_at) return 'Required: Send review request';
  if (!closeout.review_completed_at) return 'Waiting: Review from customer';
  if (!closeout.referral_requested_at) return 'Required: Send referral ask';
  if (!closeout.referral_completed_at) return 'Waiting: Referral response';
  if (!closeout.discount_offered_at) return 'Required: Send book-again discount';
  if (!closeout.follow_up_sent_at) return 'Required: Send follow-up';
  return 'Closeout complete';
}

export async function loadJobCloseouts(admin: SupabaseClient): Promise<{
  items: JobCloseoutItem[];
  pendingCount: number;
  tablesReady: boolean;
}> {
  const probe = await admin.from('titan_job_closeouts').select('id').limit(1);
  if (probe.error) return { items: [], pendingCount: 0, tablesReady: false };

  await ensureCloseoutsForRecentJobs(admin);

  const { data: closeouts } = await admin
    .from('titan_job_closeouts')
    .select('*')
    .neq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(20);

  const apptIds = (closeouts ?? []).map((r) => str((r as { appointment_id?: string }).appointment_id)).filter(Boolean);
  const apptMap = new Map<string, Record<string, unknown>>();

  if (apptIds.length > 0) {
    const { data: appts } = await admin
      .from('appointments')
      .select('id, guest_name, job_completed_at, customer_id')
      .in('id', apptIds);
    for (const a of appts ?? []) {
      apptMap.set(str((a as { id?: string }).id), a as Record<string, unknown>);
    }
  }

  const items: JobCloseoutItem[] = [];

  for (const row of closeouts ?? []) {
    const r = row as Record<string, unknown>;
    const appt = apptMap.get(str(r.appointment_id)) ?? {};
    const name = str(appt.guest_name) || 'Customer';
    const outreach = buildOutreachForCustomer({ customerName: name });

    const reviewRequested = Boolean(r.review_requested_at);
    const reviewCompleted = Boolean(r.review_completed_at);
    const referralRequested = Boolean(r.referral_requested_at);
    const referralCompleted = Boolean(r.referral_completed_at);
    const discountOffered = Boolean(r.discount_offered_at);
    const followUpSent = Boolean(r.follow_up_sent_at);
    const isComplete = reviewRequested && referralRequested && discountOffered;

    items.push({
      id: str(r.id),
      appointmentId: str(r.appointment_id),
      customerName: name,
      completedAt: str(appt.job_completed_at) || str(r.created_at),
      status: str(r.status),
      reviewRequested,
      reviewCompleted,
      referralRequested,
      referralCompleted,
      discountOffered,
      followUpSent,
      isComplete,
      nextStep: nextStepFor(r),
      outreachSms: outreach.sms,
      href: `/admin/customers/${str(appt.customer_id) || ''}`,
    });
  }

  return { items, pendingCount: items.filter((i) => !i.isComplete).length, tablesReady: true };
}

export async function advanceCloseout(
  admin: SupabaseClient,
  closeoutId: string,
  step: 'review' | 'referral' | 'discount' | 'follow_up',
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const fieldMap = {
    review: { review_requested_at: now, status: 'review_sent' },
    referral: { referral_requested_at: now, status: 'referral_sent' },
    discount: { discount_offered_at: now },
    follow_up: { follow_up_sent_at: now, status: 'complete' },
  };

  const patch = fieldMap[step];
  const { error } = await admin.from('titan_job_closeouts').update({ ...patch, updated_at: now }).eq('id', closeoutId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateProspectEnrichment(
  admin: SupabaseClient,
  prospectId: string,
  input: {
    contactName?: string;
    contactRole?: string;
    decisionMakerTitle?: string;
    email?: string;
    phone?: string;
    website?: string;
    notes?: string;
    acquisitionSource?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin
    .from('titan_prospects')
    .update({
      contact_name: input.contactName,
      contact_role: input.contactRole,
      decision_maker_title: input.decisionMakerTitle,
      email: input.email,
      phone: input.phone,
      website: input.website,
      enrichment_notes: input.notes,
      acquisition_source: input.acquisitionSource,
      updated_at: new Date().toISOString(),
    })
    .eq('id', prospectId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

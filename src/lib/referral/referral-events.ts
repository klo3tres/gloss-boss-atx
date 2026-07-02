import type { SupabaseClient } from '@supabase/supabase-js';

export type ReferralEventStatus = 'clicked' | 'signed_up' | 'booked' | 'completed' | 'reward_issued' | 'expired';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export async function recordReferralEvent(
  admin: SupabaseClient,
  input: {
    referralCode: string;
    referrerCustomerId?: string | null;
    status: ReferralEventStatus;
    referredEmail?: string | null;
    referredCustomerId?: string | null;
    appointmentId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; eventId?: string; error?: string }> {
  const code = str(input.referralCode).toUpperCase();
  if (!code) return { ok: false, error: 'Missing referral code' };

  let referrerId = str(input.referrerCustomerId) || null;
  if (!referrerId) {
    const { data } = await admin.from('customer_referral_codes').select('customer_id').ilike('code', code).maybeSingle();
    referrerId = data?.customer_id ? String(data.customer_id) : null;
  }

  const row = {
    referral_code: code,
    referrer_customer_id: referrerId,
    referred_email: str(input.referredEmail).toLowerCase() || null,
    referred_customer_id: input.referredCustomerId ?? null,
    appointment_id: input.appointmentId ?? null,
    status: input.status,
    metadata: input.metadata ?? {},
    updated_at: new Date().toISOString(),
  };

  if (input.appointmentId) {
    const existing = await admin
      .from('referral_events')
      .select('id, status')
      .eq('appointment_id', input.appointmentId)
      .maybeSingle();
    if (existing.data?.id) {
      const { error } = await admin.from('referral_events').update(row).eq('id', existing.data.id);
      return error ? { ok: false, error: error.message } : { ok: true, eventId: String(existing.data.id) };
    }
  }

  const { data, error } = await admin.from('referral_events').insert(row).select('id').maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, eventId: data?.id ? String(data.id) : undefined };
}

export async function loadReferralStatsForCustomer(
  admin: SupabaseClient,
  customerId: string,
): Promise<{
  sent: number;
  booked: number;
  completed: number;
  rewardsEarned: number;
  rewardsAvailable: number;
}> {
  const [{ count: sent }, { data: events }, { data: rewards }] = await Promise.all([
    admin.from('referral_events').select('id', { count: 'exact', head: true }).eq('referrer_customer_id', customerId),
    admin.from('referral_events').select('status').eq('referrer_customer_id', customerId),
    admin.from('referral_rewards').select('status').eq('customer_id', customerId),
  ]);

  const rows = events ?? [];
  const booked = rows.filter((e) => ['booked', 'completed', 'reward_issued'].includes(String(e.status))).length;
  const completed = rows.filter((e) => ['completed', 'reward_issued'].includes(String(e.status))).length;
  const rewardRows = rewards ?? [];
  const rewardsEarned = rewardRows.length;
  const rewardsAvailable = rewardRows.filter((r) => r.status === 'pending' || r.status === 'issued').length;

  return { sent: sent ?? rows.length, booked, completed, rewardsEarned, rewardsAvailable };
}

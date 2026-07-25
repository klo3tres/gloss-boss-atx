import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppRole } from '@/lib/auth/roles';
import { recordCustomerPortalEvent } from '@/lib/customer-portal-tracking';
import { recordJobTimelineEvent } from '@/lib/job-timeline-server';
import { logTitanActivity } from '@/lib/titan/activity-feed';

export function buildTrackedBalancePayUrl(origin: string, appointmentId: string, accessToken: string): string {
  const base = origin.replace(/\/$/, '');
  const t = encodeURIComponent(accessToken);
  return `${base}/pay/balance/${encodeURIComponent(appointmentId)}?t=${t}`;
}

export async function logBalancePaymentLinkClick(
  admin: SupabaseClient,
  appointmentId: string,
  input: { headers: Headers; role?: AppRole | null; token?: string },
): Promise<{ counted: boolean; exclusionReason: string | null }> {
  const portalEvent = await recordCustomerPortalEvent(admin, {
    appointmentId,
    token: input.token,
    eventType: 'payment_page_opened',
    headers: input.headers,
    role: input.role,
    channelSource: 'tracked_pay_link',
  });
  if (!portalEvent.counted) return portalEvent;

  const now = new Date().toISOString();
  await recordJobTimelineEvent(admin, {
    appointmentId,
    eventType: 'payment_link_clicked',
    meta: { source: 'tracked_pay_link', clicked_at: now },
  });
  await logTitanActivity(admin, {
    kind: 'payment_link_clicked',
    title: 'Customer opened balance pay link',
    detail: `Appointment ${appointmentId.slice(0, 8)}…`,
    href: `/admin/work-orders/${appointmentId}`,
  });
  try {
    await admin.from('notification_outbox').insert({
      kind: 'payment_link_clicked',
      channel: 'internal',
      provider: 'gloss_boss',
      status: 'delivered',
      appointment_id: appointmentId,
      payload: { appointment_id: appointmentId, clicked_at: now },
      created_at: now,
    });
  } catch {
    /* non-blocking */
  }
  return portalEvent;
}

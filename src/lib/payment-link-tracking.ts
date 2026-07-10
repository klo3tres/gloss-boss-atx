import type { SupabaseClient } from '@supabase/supabase-js';
import { recordJobTimelineEvent } from '@/lib/job-timeline-server';
import { logTitanActivity } from '@/lib/titan/activity-feed';

export function buildTrackedBalancePayUrl(origin: string, appointmentId: string, accessToken: string): string {
  const base = origin.replace(/\/$/, '');
  const t = encodeURIComponent(accessToken);
  return `${base}/pay/balance/${encodeURIComponent(appointmentId)}?t=${t}`;
}

export async function logBalancePaymentLinkClick(admin: SupabaseClient, appointmentId: string): Promise<void> {
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
}

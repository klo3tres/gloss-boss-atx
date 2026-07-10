import type { SupabaseClient } from '@supabase/supabase-js';
import { logTitanActivity } from '@/lib/titan/activity-feed';
import { displayMoney } from '@/lib/display-format';

function todayChicago(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

/** Close balance daily actions and log owner activity when final balance is collected. */
export async function onFinalBalancePaymentCompleted(
  admin: SupabaseClient,
  params: { appointmentId: string; amountCents: number; sessionId?: string },
): Promise<void> {
  const { appointmentId, amountCents, sessionId } = params;
  const now = new Date().toISOString();
  const actionDate = todayChicago();

  await admin
    .from('titan_daily_actions')
    .update({ status: 'completed', sent_at: now, updated_at: now })
    .eq('action_date', actionDate)
    .eq('entity_type', 'appointment')
    .eq('entity_id', appointmentId)
    .eq('action_type', 'balance')
    .in('status', ['pending', 'sent']);

  await admin
    .from('titan_daily_actions')
    .update({ status: 'completed', sent_at: now, updated_at: now })
    .like('action_key', `balance-${appointmentId}%`)
    .in('status', ['pending', 'sent']);

  const { data: appt } = await admin
    .from('appointments')
    .select('guest_name, guest_email, customer_id')
    .eq('id', appointmentId)
    .maybeSingle();

  const guestName = String((appt as { guest_name?: string } | null)?.guest_name ?? 'Customer');
  await logTitanActivity(admin, {
    kind: 'payment_received',
    title: `Balance collected — ${guestName} (${displayMoney(amountCents)})`,
    detail: sessionId ? `Stripe session ${sessionId}` : 'Final balance paid',
    href: `/admin/work-orders/${appointmentId}`,
  });

  const customerId = (appt as { customer_id?: string } | null)?.customer_id;
  if (customerId) {
    try {
      await admin.from('customer_timeline_events').insert({
        customer_id: customerId,
        event_type: 'payment_received',
        title: 'Final balance paid',
        detail: displayMoney(amountCents),
        href: '/dashboard',
        meta: { appointment_id: appointmentId, amount_cents: amountCents, session_id: sessionId ?? null },
        created_at: now,
      });
    } catch {
      /* optional table */
    }
  }
}
